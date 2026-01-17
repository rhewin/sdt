import { DateTime } from 'luxon';
import cron from 'node-cron';
import { BIRTHDAY_MESSAGE_HOUR } from '@/config/constants';
import { birthdayQueue } from '@/config/queue';
import { logger, logCriticalOperation } from '@/config/logger';
import { generateIdempotencyKey } from '@/shared/utils';
import { BirthdayMessageData } from '@/shared/types';
import { User } from '@/domains/user/user.model';
import { UserRepository } from '@/domains/user/user.repository';
import { MessageLogRepository } from '@/domains/message-log/message-log.repository';
import { MessageStatus } from '@/domains/message-log/message-log.model';

export class HourlySchedulerService {
  private cronJob: cron.ScheduledTask | null = null;
  private userRepository: UserRepository;
  private messageLogRepository: MessageLogRepository;

  constructor() {
    this.userRepository = new UserRepository();
    this.messageLogRepository = new MessageLogRepository();
  }

  start = (): void => {
    // Run every hour at minute 0
    this.cronJob = cron.schedule('0 * * * *', async () => {
      await this.runScheduler();
    });

    logger.info('Hourly scheduler started (runs every hour at minute 0)');
  };

  stop = (): void => {
    if (this.cronJob) {
      this.cronJob.stop();
      logger.info('Hourly scheduler stopped');
    }
  };

  private runScheduler = async (): Promise<void> => {
    const trace_id = `scheduler-${Date.now()}`;
    const now = DateTime.now();

    logger.info({ trace_id, currentTime: now.toISO() }, 'Hourly scheduler running');

    try {
      // Step 1: Find all users with birthday TODAY and create/update message_logs
      await this.processTodayBirthdays(trace_id);

      // Step 2: Queue pending messages whose scheduled_for time has arrived
      await this.queueDueMessages(trace_id);

      logger.info({ trace_id }, 'Hourly scheduler completed');
    } catch (error) {
      logger.error(
        {
          trace_id,
          error: (error as Error).message,
          stack: (error as Error).stack,
        },
        'Hourly scheduler failed'
      );
    }
  };

  /**
   * Find all users with birthday today and create/update message_logs entries
   */
  private processTodayBirthdays = async (trace_id: string): Promise<void> => {
    const today = DateTime.now();
    const currentMonth = today.month;
    const currentDay = today.day;

    logger.info(
      {
        trace_id,
        month: currentMonth,
        day: currentDay,
      },
      'Searching for users with birthday today'
    );

    // Find all users with birthday today (month and day match)
    const allUsers = await this.userRepository.findAll();
    const birthdayUsers = allUsers.filter(user => {
      const birthDate =
        user.birthDate instanceof Date
          ? DateTime.fromJSDate(user.birthDate)
          : DateTime.fromISO(user.birthDate as unknown as string);

      return birthDate.month === currentMonth && birthDate.day === currentDay;
    });

    logger.info(
      {
        trace_id,
        count: birthdayUsers.length,
      },
      'Found users with birthday today'
    );

    // Process each birthday user
    for (const user of birthdayUsers) {
      try {
        await this.processUserBirthday(user, trace_id);
      } catch (error) {
        logger.error(
          {
            trace_id,
            userId: user.id,
            error: (error as Error).message,
          },
          'Failed to process user birthday'
        );
      }
    }
  };

  /**
   * Process a single user's birthday - create message_logs entry if not exists
   */
  private processUserBirthday = async (user: User, trace_id: string): Promise<void> => {
    const todayInUserTz = DateTime.now().setZone(user.timezone);
    const birthDate =
      user.birthDate instanceof Date
        ? DateTime.fromJSDate(user.birthDate)
        : DateTime.fromISO(user.birthDate as unknown as string);

    // Calculate execution time (BIRTHDAY_MESSAGE_HOUR in user's timezone)
    const executionTime = todayInUserTz.set({
      hour: BIRTHDAY_MESSAGE_HOUR,
      minute: 0,
      second: 0,
      millisecond: 0,
    });

    const executionTimeUtc = executionTime.toUTC();
    const scheduledDate = todayInUserTz.toFormat('yyyy-MM-dd');
    const idempotencyKey = generateIdempotencyKey(user.id, 'birthday', new Date(scheduledDate));

    // Check if message_logs entry already exists
    const existingLog = await this.messageLogRepository.findByIdempotencyKey(idempotencyKey);

    if (existingLog) {
      // Entry exists - check if we need to update status from 'unprocessed' to 'pending'
      if (existingLog.status === MessageStatus.UNPROCESSED) {
        await this.messageLogRepository.updateStatus(existingLog.id, MessageStatus.PENDING);

        logger.info(
          {
            trace_id,
            userId: user.id,
            messageLogId: existingLog.id,
          },
          'Updated message_logs status from unprocessed to pending'
        );

        logCriticalOperation(trace_id, 'message_status_updated_to_pending', {
          userId: user.id,
          email: user.email,
          messageLogId: existingLog.id,
          previousStatus: 'unprocessed',
        });
      }
    } else {
      // Entry doesn't exist - create new one with status 'pending'
      const messageLog = await this.messageLogRepository.createOrGet({
        userId: user.id,
        messageType: 'birthday',
        scheduledDate: new Date(scheduledDate),
        scheduledFor: executionTimeUtc.toJSDate(),
        idempotencyKey,
      });

      // Update to 'pending' status
      await this.messageLogRepository.updateStatus(messageLog.id, MessageStatus.PENDING);

      logger.info(
        {
          trace_id,
          userId: user.id,
          messageLogId: messageLog.id,
        },
        'Created message_logs entry with pending status'
      );

      logCriticalOperation(trace_id, 'message_log_created_by_scheduler', {
        userId: user.id,
        email: user.email,
        timezone: user.timezone,
        birthDate: `${birthDate.month}-${birthDate.day}`,
        scheduledFor: executionTimeUtc.toISO(),
        messageLogId: messageLog.id,
      });
    }
  };

  /**
   * Queue pending messages whose scheduled_for time has arrived or passed
   * Respects user timezone - each user gets message at their local time
   * @param trace_id - Trace ID for logging
   * @param checkDueTime - If false, queues all pending messages regardless of scheduled time (default: true)
   */
  queueDueMessages = async (
    trace_id: string,
    checkDueTime: boolean = true
  ): Promise<{
    total: number;
    queued: number;
    skippedNotDue: number;
    skippedAlreadyQueued: number;
    failed: string[];
  }> => {
    const now = DateTime.now();
    const today = now.toFormat('yyyy-MM-dd');

    // Find all pending messages for today
    const pendingMessages = await this.messageLogRepository.findPendingForDate(new Date(today));

    logger.info(
      {
        trace_id,
        count: pendingMessages.length,
        currentTime: now.toISO(),
      },
      'Checking pending messages for due time'
    );

    let queuedCount = 0;
    let skippedNotDue = 0;
    let skippedAlreadyQueued = 0;
    const failed: string[] = [];

    for (const messageLog of pendingMessages) {
      try {
        const scheduledFor = DateTime.fromJSDate(messageLog.scheduledFor);

        // Check if scheduled time has arrived or passed (only if checkDueTime is true)
        if (checkDueTime && scheduledFor > now) {
          skippedNotDue++;
          logger.debug(
            {
              trace_id,
              messageLogId: messageLog.id,
              scheduledFor: scheduledFor.toISO(),
              currentTime: now.toISO(),
              minutesUntilDue: scheduledFor.diff(now, 'minutes').minutes,
            },
            'Message not due yet, skipping'
          );
          continue;
        }

        // Check if job already exists in BullMQ
        const existingJob = await birthdayQueue.getJob(messageLog.idempotencyKey);

        if (existingJob) {
          skippedAlreadyQueued++;
          logger.debug(
            {
              trace_id,
              messageLogId: messageLog.id,
              jobId: messageLog.idempotencyKey,
            },
            'Job already exists in queue, skipping'
          );
          continue;
        }

        // Message is due - add to queue with delay=0 (execute immediately)
        const jobData: BirthdayMessageData = {
          userId: messageLog.userId,
          scheduledFor: messageLog.scheduledFor,
          trace_id: `scheduler-${messageLog.id}-${Date.now()}`,
        };

        const job = await birthdayQueue.add('send-birthday-message', jobData, {
          delay: 0, // Execute immediately
          jobId: messageLog.idempotencyKey,
          removeOnComplete: true, // Clean up after completion
          removeOnFail: false, // Keep failed jobs for analysis
        });

        queuedCount++;

        logCriticalOperation(trace_id, 'birthday_job_queued_by_scheduler', {
          userId: messageLog.userId,
          messageLogId: messageLog.id,
          jobId: job.id,
          idempotencyKey: messageLog.idempotencyKey,
          scheduledFor: scheduledFor.toISO(),
          queuedAt: now.toISO(),
        });

        logger.info(
          {
            trace_id,
            messageLogId: messageLog.id,
            userId: messageLog.userId,
            jobId: job.id,
            scheduledFor: scheduledFor.toISO(),
          },
          'Queued birthday message to BullMQ'
        );
      } catch (error) {
        logger.error(
          {
            trace_id,
            messageLogId: messageLog.id,
            error: (error as Error).message,
          },
          'Failed to queue message to BullMQ'
        );
        failed.push(messageLog.id);
      }
    }

    logger.info(
      {
        trace_id,
        total: pendingMessages.length,
        queued: queuedCount,
        skippedNotDue,
        skippedAlreadyQueued,
        failed: failed.length,
      },
      'Queue due messages completed'
    );

    return {
      total: pendingMessages.length,
      queued: queuedCount,
      skippedNotDue,
      skippedAlreadyQueued,
      failed,
    };
  };
}

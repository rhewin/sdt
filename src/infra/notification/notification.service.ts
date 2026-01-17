import { DateTime } from 'luxon';
import { logger, logCriticalOperation } from '@/config/logger';
import { BIRTHDAY_MESSAGE_HOUR } from '@/config/constants';
import { birthdayQueue } from '@/config/queue';
import { User } from '@/domains/user/user.model';
import { MessageLogRepository } from '@/domains/message-log/message-log.repository';
import { MessageStatus } from '@/domains/message-log/message-log.model';
import { generateIdempotencyKey } from '@/shared/utils';
import { BirthdayMessageData } from '@/shared/types';
import { MessageType, ScheduleResult } from './types/notification.types';
import { getHandlerByType } from './handlers';

/**
 * Notification Service - Orchestrates all notification types
 * Delegates to specific handlers based on message type
 */
export class NotificationService {
  private messageLogRepository: MessageLogRepository;

  constructor() {
    this.messageLogRepository = new MessageLogRepository();
  }
  /**
   * Schedule a notification for a user
   * @param messageType Type of notification (birthday, anniversary, etc.)
   * @param user User to schedule notification for
   * @param traceId Optional trace ID for logging
   */
  scheduleNotification = async (
    messageType: MessageType,
    user: User,
    traceId?: string
  ): Promise<ScheduleResult> => {
    const handler = getHandlerByType(messageType);

    if (!handler) {
      logger.error({ messageType, userId: user.id }, 'No handler found for message type');
      return {
        success: false,
        error: `No handler registered for message type: ${messageType}`,
      };
    }

    logger.debug({
      traceId,
      messageType,
      userId: user.id,
      email: user.email,
    }, 'Scheduling notification via handler');

    return handler.schedule(user, traceId);
  }

  /**
   * Schedule all applicable notifications for a new user
   * Currently schedules birthday messages, can be extended for welcome emails, etc.
   */
  scheduleAllForNewUser = async (user: User, traceId?: string): Promise<void> => {
    const trace_id = traceId || `schedule-all-${user.id}-${Date.now()}`;

    logger.info({
      trace_id,
      userId: user.id,
      email: user.email,
    }, 'Scheduling all notifications for new user');

    // Schedule birthday message
    await this.scheduleNotification('birthday', user, trace_id);
  }

  /**
   * Handle user update - reschedule notifications if birthdate or timezone changed
   * RACE CONDITION SAFETY:
   * - Removes BullMQ job BEFORE updating message_log to prevent double send
   * - Checks PROCESSING status to avoid cancelling in-flight messages
   * - Uses idempotency keys to prevent duplicate jobs
   *
   * @param user Updated user data
   * @param oldUser Previous user data
   * @param changes Changed fields
   * @param traceId Optional trace ID for logging
   */
  handleUserUpdate = async (
    user: User,
    oldUser: User,
    changes: Record<string, any>,
    traceId?: string
  ): Promise<void> => {
    const trace_id = traceId || `user-update-${user.id}-${Date.now()}`;

    // Check if birthdate or timezone changed
    const birthdateChanged = changes.birthDate !== undefined;
    const timezoneChanged = changes.timezone !== undefined;

    if (!birthdateChanged && !timezoneChanged) {
      logger.debug({ trace_id, userId: user.id }, 'No birthdate or timezone change, skipping notification update');
      return;
    }

    logger.info({
      trace_id,
      userId: user.id,
      birthdateChanged,
      timezoneChanged,
      oldBirthDate: oldUser.birthDate,
      newBirthDate: user.birthDate,
      oldTimezone: oldUser.timezone,
      newTimezone: user.timezone,
    }, 'User birthdate or timezone changed, updating message_log');

    try {
      // If birthdate changed, we need to cancel old birthday message and create new one
      if (birthdateChanged) {
        await this.handleBirthdateChange(user, oldUser, trace_id);
      }
      // If only timezone changed (not birthdate), update the scheduled_for time
      else if (timezoneChanged) {
        await this.handleTimezoneChange(user, oldUser, trace_id);
      }
    } catch (error) {
      logger.error({
        trace_id,
        userId: user.id,
        error: (error as Error).message,
        stack: (error as Error).stack,
      }, 'Failed to update message_log after user update');
      // Don't throw - user update should succeed even if message log update fails
    }
  }

  /**
   * Handle birthdate change - cancel old message and create new one
   *
   * RACE CONDITION SAFETY:
   * 1. Remove BullMQ job first (prevents worker from picking it up)
   * 2. Check message_log status (abort if PROCESSING - already being sent)
   * 3. Update message_log to FAILED (marks as cancelled)
   * 4. Create new message_log for new birthday
   */
  private handleBirthdateChange = async (user: User, oldUser: User, trace_id: string): Promise<void> => {
    // Find old message_log entry for old birthday (this year)
    const oldBirthDate = oldUser.birthDate instanceof Date
      ? DateTime.fromJSDate(oldUser.birthDate)
      : DateTime.fromISO(oldUser.birthDate as unknown as string);

    const today = DateTime.now();
    const oldScheduledDate = today.set({
      month: oldBirthDate.month,
      day: oldBirthDate.day,
    }).toFormat('yyyy-MM-dd');

    const oldIdempotencyKey = generateIdempotencyKey(user.id, 'birthday', new Date(oldScheduledDate));

    // STEP 1: Remove job from BullMQ FIRST (prevents race with worker)
    try {
      const existingJob = await birthdayQueue.getJob(oldIdempotencyKey);
      if (existingJob) {
        await existingJob.remove();
        logCriticalOperation(trace_id, 'bullmq_job_removed_birthdate_change', {
          userId: user.id,
          jobId: oldIdempotencyKey,
          oldBirthDate: `${oldBirthDate.month}-${oldBirthDate.day}`,
        });
        logger.info({
          trace_id,
          userId: user.id,
          jobId: oldIdempotencyKey,
        }, 'Removed old job from BullMQ before birthdate change');
      }
    } catch (error) {
      logger.error({
        trace_id,
        userId: user.id,
        error: (error as Error).message,
      }, 'Failed to remove old job from BullMQ');
      // Continue anyway - job might not exist or already completed
    }

    // STEP 2: Check and update message_log
    const oldMessageLog = await this.messageLogRepository.findByIdempotencyKey(oldIdempotencyKey);

    if (oldMessageLog) {
      // CRITICAL: If PROCESSING, the worker already picked it up - abort!
      if (oldMessageLog.status === MessageStatus.PROCESSING) {
        logger.warn({
          trace_id,
          userId: user.id,
          oldMessageLogId: oldMessageLog.id,
          status: oldMessageLog.status,
        }, 'Message already being processed, cannot cancel - allowing it to complete');

        // Still create new message for new birthday
        await this.scheduleNotification('birthday', user, trace_id);
        return;
      }

      // If SENT, just log and create new message
      if (oldMessageLog.status === MessageStatus.SENT) {
        logger.debug({
          trace_id,
          userId: user.id,
          oldMessageLogId: oldMessageLog.id,
        }, 'Old message already sent, creating new message for new birthdate');

        await this.scheduleNotification('birthday', user, trace_id);
        return;
      }

      // Safe to cancel (UNPROCESSED or PENDING)
      if (oldMessageLog.status === MessageStatus.UNPROCESSED || oldMessageLog.status === MessageStatus.PENDING) {
        await this.messageLogRepository.updateStatus(
          oldMessageLog.id,
          MessageStatus.FAILED,
          'Cancelled due to birthdate change'
        );

        logCriticalOperation(trace_id, 'message_cancelled_birthdate_change', {
          userId: user.id,
          oldMessageLogId: oldMessageLog.id,
          oldBirthDate: `${oldBirthDate.month}-${oldBirthDate.day}`,
          newBirthDate: user.birthDate,
        });

        logger.info({
          trace_id,
          userId: user.id,
          oldMessageLogId: oldMessageLog.id,
          oldBirthDate: `${oldBirthDate.month}-${oldBirthDate.day}`,
        }, 'Cancelled old birthday message due to birthdate change');
      }
    }

    // STEP 3: Create new message_log for new birthday
    await this.scheduleNotification('birthday', user, trace_id);

    logger.info({
      trace_id,
      userId: user.id,
      oldBirthDate: `${oldBirthDate.month}-${oldBirthDate.day}`,
      newBirthDate: user.birthDate,
    }, 'Birthday message rescheduled for new birthdate');
  }

  /**
   * Handle timezone change - update scheduled_for time in existing message_log
   *
   * RACE CONDITION SAFETY:
   * 1. Remove existing BullMQ job first
   * 2. Check message_log status (abort if PROCESSING/SENT)
   * 3. Update message_log with new scheduled_for time
   * 4. Re-queue to BullMQ if status is PENDING and time is due
   */
  private handleTimezoneChange = async (user: User, oldUser: User, trace_id: string): Promise<void> => {
    // Birthday didn't change, only timezone - need to recalculate scheduled_for
    const birthDate = user.birthDate instanceof Date
      ? DateTime.fromJSDate(user.birthDate)
      : DateTime.fromISO(user.birthDate as unknown as string);

    const today = DateTime.now();
    const scheduledDate = today.set({
      month: birthDate.month,
      day: birthDate.day,
    }).toFormat('yyyy-MM-dd');

    const idempotencyKey = generateIdempotencyKey(user.id, 'birthday', new Date(scheduledDate));

    // STEP 1: Remove job from BullMQ FIRST
    try {
      const existingJob = await birthdayQueue.getJob(idempotencyKey);
      if (existingJob) {
        await existingJob.remove();
        logCriticalOperation(trace_id, 'bullmq_job_removed_timezone_change', {
          userId: user.id,
          jobId: idempotencyKey,
          oldTimezone: oldUser.timezone,
          newTimezone: user.timezone,
        });
        logger.info({
          trace_id,
          userId: user.id,
          jobId: idempotencyKey,
        }, 'Removed old job from BullMQ before timezone change');
      }
    } catch (error) {
      logger.error({
        trace_id,
        userId: user.id,
        error: (error as Error).message,
      }, 'Failed to remove old job from BullMQ');
      // Continue anyway
    }

    // STEP 2: Get and check message_log
    const existingMessageLog = await this.messageLogRepository.findByIdempotencyKey(idempotencyKey);

    if (!existingMessageLog) {
      logger.debug({ trace_id, userId: user.id }, 'No existing message_log found for timezone update');
      return;
    }

    // CRITICAL: Abort if PROCESSING (worker already picked it up)
    if (existingMessageLog.status === MessageStatus.PROCESSING) {
      logger.warn({
        trace_id,
        userId: user.id,
        messageLogId: existingMessageLog.id,
        status: existingMessageLog.status,
      }, 'Message already being processed, cannot update time - allowing it to complete with old timezone');
      return;
    }

    // Don't update if already sent
    if (existingMessageLog.status === MessageStatus.SENT) {
      logger.debug({
        trace_id,
        userId: user.id,
        messageLogId: existingMessageLog.id,
        status: existingMessageLog.status,
      }, 'Message already sent, not updating scheduled time');
      return;
    }

    // STEP 3: Recalculate scheduled_for with new timezone
    const todayInNewTz = DateTime.now().setZone(user.timezone);
    const executionTime = todayInNewTz.set({
      month: birthDate.month,
      day: birthDate.day,
      hour: BIRTHDAY_MESSAGE_HOUR,
      minute: 0,
      second: 0,
      millisecond: 0,
    });
    const newScheduledFor = executionTime.toUTC().toJSDate();

    // STEP 4: Update the scheduled_for time in message_log
    await this.messageLogRepository.update(existingMessageLog.id, {
      scheduledFor: newScheduledFor,
    });

    logCriticalOperation(trace_id, 'message_rescheduled_timezone_change', {
      userId: user.id,
      messageLogId: existingMessageLog.id,
      oldTimezone: oldUser.timezone,
      newTimezone: user.timezone,
      oldScheduledFor: existingMessageLog.scheduledFor,
      newScheduledFor,
    });

    logger.info({
      trace_id,
      userId: user.id,
      messageLogId: existingMessageLog.id,
      oldTimezone: oldUser.timezone,
      newTimezone: user.timezone,
      oldScheduledFor: existingMessageLog.scheduledFor,
      newScheduledFor,
    }, 'Updated message scheduled time due to timezone change');

    // STEP 5: If status is PENDING and new time is now due, re-queue immediately
    if (existingMessageLog.status === MessageStatus.PENDING) {
      const now = DateTime.now();
      const scheduledForDateTime = DateTime.fromJSDate(newScheduledFor);

      if (scheduledForDateTime <= now) {
        // Time is due - re-queue to BullMQ
        try {
          const jobData: BirthdayMessageData = {
            userId: user.id,
            scheduledFor: newScheduledFor,
            trace_id: `timezone-requeue-${user.id}-${Date.now()}`,
          };

          await birthdayQueue.add('send-birthday-message', jobData, {
            delay: 0,
            jobId: idempotencyKey,
            removeOnComplete: true,
            removeOnFail: false,
          });

          logCriticalOperation(trace_id, 'birthday_job_requeued_timezone_change', {
            userId: user.id,
            messageLogId: existingMessageLog.id,
            jobId: idempotencyKey,
            newScheduledFor: newScheduledFor,
          });

          logger.info({
            trace_id,
            userId: user.id,
            jobId: idempotencyKey,
          }, 'Re-queued birthday message after timezone change (time is now due)');
        } catch (error) {
          logger.error({
            trace_id,
            userId: user.id,
            error: (error as Error).message,
          }, 'Failed to re-queue message after timezone change');
        }
      }
    }
  }
}

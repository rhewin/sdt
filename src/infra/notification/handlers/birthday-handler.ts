import { DateTime } from 'luxon';
import { BIRTHDAY_MESSAGE_HOUR } from '@/config/constants';
import { logCriticalOperation, logError, logger } from '@/config/logger';
import { generateIdempotencyKey } from '@/shared/utils';
import { MessageLogRepository } from '@/domains/message-log/message-log.repository';
import { User } from '@/domains/user/user.model';
import { NotificationHandler, ScheduleResult } from '../types/notification.types';

/**
 * Handles birthday message scheduling
 */
export class BirthdayHandler implements NotificationHandler {
  readonly messageType = 'birthday' as const;
  private messageLogRepository: MessageLogRepository;

  constructor() {
    this.messageLogRepository = new MessageLogRepository();
  }

  /**
   * Create message_logs entry for user's birthday if it hasn't passed this year
   * Status depends on birthday date and current time:
   * - Birthday = today, before BIRTHDAY_MESSAGE_HOUR → 'pending'
   * - Birthday = today, after BIRTHDAY_MESSAGE_HOUR → 'pending' with error_message
   * - Birthday = future → 'unprocessed'
   */
  schedule = async (user: User, traceId?: string): Promise<ScheduleResult> => {
    const trace_id = traceId || `birthday-schedule-${user.id}-${Date.now()}`;

    try {
      // Extract birthday month and day
      const birthDate =
        user.birthDate instanceof Date
          ? DateTime.fromJSDate(user.birthDate)
          : DateTime.fromISO(user.birthDate as unknown as string);

      // Get today's date in user's timezone (no time)
      const todayInUserTz = DateTime.now().setZone(user.timezone);
      const todayDateOnly = todayInUserTz.set({
        hour: 0,
        minute: 0,
        second: 0,
        millisecond: 0,
      });

      // Get birthday date for this year in user's timezone (no time)
      const birthdayDateThisYear = todayInUserTz.set({
        month: birthDate.month,
        day: birthDate.day,
        hour: 0,
        minute: 0,
        second: 0,
        millisecond: 0,
      });

      logger.debug(
        {
          trace_id,
          email: user.email,
          birthMonth: birthDate.month,
          birthDay: birthDate.day,
          birthdayDateThisYear: birthdayDateThisYear.toISODate(),
          todayDate: todayDateOnly.toISODate(),
        },
        'Checking if message_logs entry should be created'
      );

      // Birthday date has already passed this year - skip
      if (birthdayDateThisYear < todayDateOnly) {
        logger.debug(
          { trace_id, birthdayDate: birthdayDateThisYear.toISODate() },
          'Birthday date already passed this year, skipping'
        );
        return { success: true };
      }

      // Calculate execution time (BIRTHDAY_MESSAGE_HOUR in user's timezone)
      const executionTime = todayInUserTz.set({
        month: birthDate.month,
        day: birthDate.day,
        hour: BIRTHDAY_MESSAGE_HOUR,
        minute: 0,
        second: 0,
        millisecond: 0,
      });

      const executionTimeUtc = executionTime.toUTC();
      const scheduledDate = birthdayDateThisYear.toFormat('yyyy-MM-dd');
      const idempotencyKey = generateIdempotencyKey(user.id, 'birthday', new Date(scheduledDate));

      // Determine status and error message
      const isBirthdayToday = birthdayDateThisYear.equals(todayDateOnly);
      const now = DateTime.now();
      const executionTimePassed = executionTimeUtc < now;

      let status: 'unprocessed' | 'pending' = 'unprocessed';
      let errorMessage: string | undefined = undefined;

      if (isBirthdayToday) {
        status = 'pending';
        if (executionTimePassed) {
          errorMessage = 'User created after scheduled send time, requires manual trigger';
        }
      }

      // Create message log entry
      const messageLog = await this.messageLogRepository.createOrGet({
        userId: user.id,
        messageType: 'birthday',
        scheduledDate: new Date(scheduledDate),
        scheduledFor: executionTimeUtc.toJSDate(),
        idempotencyKey,
      });

      // Update status and error message if needed
      if (status === 'pending' || errorMessage) {
        await this.messageLogRepository.updateStatus(messageLog.id, status as any, errorMessage);
      }

      logCriticalOperation(trace_id, 'birthday_message_log_created', {
        userId: user.id,
        email: user.email,
        timezone: user.timezone,
        birthDate: `${birthDate.month}-${birthDate.day}`,
        scheduledFor: executionTimeUtc.toISO(),
        scheduledDate,
        status,
        errorMessage,
        messageLogId: messageLog.id,
      });

      logger.info(
        {
          trace_id,
          userId: user.id,
          messageLogId: messageLog.id,
          scheduledFor: executionTimeUtc.toISO(),
          status,
          isBirthdayToday,
          executionTimePassed,
        },
        'Birthday message log entry created'
      );

      return {
        success: true,
        messageLogId: messageLog.id,
      };
    } catch (error) {
      logger.error(
        {
          trace_id,
          userId: user.id,
          error: (error as Error).message,
          stack: (error as Error).stack,
        },
        'Failed to create birthday message log entry'
      );

      logError(trace_id, error as Error, {
        context: 'Failed to create birthday message log entry',
        userId: user.id,
      });

      return {
        success: false,
        error: (error as Error).message,
      };
    }
  };
}

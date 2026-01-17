import { User } from '@/domains/user/user.model';

/**
 * Message types supported by the notification system
 */
export type MessageType = 'birthday' | 'anniversary' | 'welcome';

/**
 * Result of a notification scheduling operation
 */
export interface ScheduleResult {
  success: boolean;
  messageLogId?: string;
  error?: string;
}

/**
 * Interface for notification handlers
 * Each message type (birthday, anniversary, etc.) implements this
 */
export interface NotificationHandler {
  /**
   * Schedule a notification for a user
   * @param user The user to schedule notification for
   * @param traceId Optional trace ID for logging
   * @returns Result of the scheduling operation
   */
  schedule(user: User, traceId?: string): Promise<ScheduleResult>;

  /**
   * The message type this handler manages
   */
  readonly messageType: MessageType;
}

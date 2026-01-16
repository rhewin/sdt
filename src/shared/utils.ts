import { DateTime } from 'luxon';

/**
 * Generate idempotency key for a message
 * @param userId User ID
 * @param messageType Type of message (e.g., 'birthday')
 * @param date Date of the message
 * @returns Idempotency key string
 */
export const generateIdempotencyKey = (userId: string, messageType: string, date: Date): string => {
  const dateStr = DateTime.fromJSDate(date).toFormat('yyyy-MM-dd');
  return `${userId}:${messageType}:${dateStr}`;
}

/**
 * Centralized configuration constants
 */

/**
 * Hour (0-23) when birthday messages should be sent in user's local timezone
 * Example: 19 = 7:00 PM in user's timezone
 */
export const BIRTHDAY_MESSAGE_HOUR = Number(process.env.BIRTHDAY_MESSAGE_HOUR) || 9;

/**
 * Maximum number of retry attempts for failed messages
 */
export const MAX_RETRY_ATTEMPTS = 5;

/**
 * Exponential backoff delay in milliseconds (first retry)
 * Subsequent retries: 2s, 4s, 8s, 16s, 32s
 */
export const RETRY_BACKOFF_DELAY = 2000;

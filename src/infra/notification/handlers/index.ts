import { NotificationHandler } from '../types/notification.types';
import { BirthdayHandler } from './birthday-handler';

/**
 * Registry of all notification handlers
 * Add new handlers here as they're implemented
 */
export const notificationHandlers: NotificationHandler[] = [new BirthdayHandler()];

/**
 * Get handler by message type
 */
export const getHandlerByType = (messageType: string): NotificationHandler | undefined => {
  return notificationHandlers.find(handler => handler.messageType === messageType);
};

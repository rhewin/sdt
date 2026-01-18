import { eventBus } from '@/infra/events/event-bus';
import { EventName, UserCreatedEvent, UserUpdatedEvent } from '@/infra/events/event.types';
import { logger } from '@/config/logger';
import { NotificationService } from './notification.service';

/**
 * Subscribe to domain events and trigger notification scheduling
 */
export class NotificationEventSubscriber {
  private notificationService: NotificationService | null = null;

  private getNotificationService(): NotificationService {
    if (!this.notificationService) {
      this.notificationService = new NotificationService();
    }
    return this.notificationService;
  }

  /**
   * Register all event handlers
   */
  register = (): void => {
    logger.info('Registering notification event subscribers');

    // When a user is created, schedule all applicable notifications
    eventBus.on<UserCreatedEvent>(EventName.USER_CREATED, async event => {
      await this.handleUserCreated(event);
    });

    // When a user is updated, handle birthdate/timezone changes
    eventBus.on<UserUpdatedEvent>(EventName.USER_UPDATED, async event => {
      await this.handleUserUpdated(event);
    });
  };

  /**
   * Handle user created event
   */
  private handleUserCreated = async (event: UserCreatedEvent): Promise<void> => {
    const { user } = event.data;
    const trace_id = event.traceId;

    logger.info(
      {
        trace_id,
        userId: user.id,
        email: user.email,
      },
      'User created event received, scheduling notifications'
    );

    try {
      await this.getNotificationService().scheduleAllForNewUser(user, trace_id);
    } catch (error) {
      logger.error(
        {
          trace_id,
          userId: user.id,
          error: (error as Error).message,
          stack: (error as Error).stack,
        },
        'Failed to schedule notifications for new user'
      );
    }
  };

  /**
   * Handle user updated event
   */
  private handleUserUpdated = async (event: UserUpdatedEvent): Promise<void> => {
    const { user, oldUser, changes } = event.data;
    const trace_id = event.traceId;

    logger.info(
      {
        trace_id,
        userId: user.id,
        email: user.email,
        changes: Object.keys(changes),
      },
      'User updated event received'
    );

    try {
      await this.getNotificationService().handleUserUpdate(user, oldUser, changes, trace_id);
    } catch (error) {
      logger.error(
        {
          trace_id,
          userId: user.id,
          error: (error as Error).message,
          stack: (error as Error).stack,
        },
        'Failed to handle user update for notifications'
      );
    }
  };
}

// Export singleton instance
export const notificationEventSubscriber = new NotificationEventSubscriber();

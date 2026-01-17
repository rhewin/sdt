import { User } from '@/domains/user/user.model';

/**
 * Event names available in the system
 */
export enum EventName {
  USER_CREATED = 'user:created',
  USER_UPDATED = 'user:updated',
  USER_DELETED = 'user:deleted',
}

export interface BaseEvent {
  name: EventName;
  timestamp: Date;
  traceId?: string;
}

/**
 * User created event
 */
export interface UserCreatedEvent extends BaseEvent {
  name: EventName.USER_CREATED;
  data: {
    user: User;
  };
}

/**
 * User updated event
 */
export interface UserUpdatedEvent extends BaseEvent {
  name: EventName.USER_UPDATED;
  data: {
    user: User;
    oldUser: User;
    changes: Record<string, any>;
  };
}

/**
 * User deleted event
 */
export interface UserDeletedEvent extends BaseEvent {
  name: EventName.USER_DELETED;
  data: {
    userId: string;
  };
}

/**
 * Union of all event types
 */
export type DomainEvent = UserCreatedEvent | UserUpdatedEvent | UserDeletedEvent;

/**
 * Event handler function type
 */
export type EventHandler<T extends DomainEvent = DomainEvent> = (event: T) => Promise<void> | void;

import { EventEmitter } from 'events';
import { EventName, UserCreatedEvent, UserUpdatedEvent, UserDeletedEvent } from '@/infra/events/event.types';
import { User } from '@/domains/user/user.model';
import * as loggerModule from '@/config/logger';

// Mock logger
jest.mock('@/config/logger', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('EventBus', () => {
  let eventBus: any;
  let mockLogger: jest.Mocked<typeof loggerModule.logger>;

  const createMockUser = (overrides?: Partial<User>): User => {
    return {
      id: 'user-123',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      birthDate: new Date('1990-01-15'),
      timezone: 'America/New_York',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: undefined,
      getFullName: function() {
        return `${this.firstName} ${this.lastName}`;
      },
      ...overrides,
    } as User;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Don't reset modules - keep the mocked logger
    // Import eventBus instance
    const eventBusModule = require('@/infra/events/event-bus');
    eventBus = eventBusModule.eventBus;

    // Reset the internal state
    (eventBus as any).handlers = new Map();
    (eventBus as any).emitter = new EventEmitter();
    (eventBus as any).emitter.setMaxListeners(50);

    mockLogger = loggerModule.logger as jest.Mocked<typeof loggerModule.logger>;
  });

  describe('constructor', () => {
    it('should initialize with EventEmitter and handlers map', () => {
      expect(eventBus).toBeDefined();
      expect((eventBus as any).emitter).toBeInstanceOf(EventEmitter);
      expect((eventBus as any).handlers).toBeInstanceOf(Map);
    });

    it('should set max listeners to 50', () => {
      const emitter = (eventBus as any).emitter as EventEmitter;
      expect(emitter.getMaxListeners()).toBe(50);
    });
  });

  describe('on - event subscription', () => {
    it('should register a handler for an event', async () => {
      const handler = jest.fn();

      eventBus.on(EventName.USER_CREATED, handler);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        { eventName: EventName.USER_CREATED, handlerCount: 1 },
        'Event handler registered'
      );
    });

    it('should register multiple handlers for the same event', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      const handler3 = jest.fn();

      eventBus.on(EventName.USER_CREATED, handler1);
      eventBus.on(EventName.USER_CREATED, handler2);
      eventBus.on(EventName.USER_CREATED, handler3);

      expect(mockLogger.debug).toHaveBeenCalledTimes(3);
      expect(mockLogger.debug).toHaveBeenLastCalledWith(
        { eventName: EventName.USER_CREATED, handlerCount: 3 },
        'Event handler registered'
      );
    });

    it('should register handlers for different events', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      eventBus.on(EventName.USER_CREATED, handler1);
      eventBus.on(EventName.USER_UPDATED, handler2);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        { eventName: EventName.USER_CREATED, handlerCount: 1 },
        'Event handler registered'
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        { eventName: EventName.USER_UPDATED, handlerCount: 1 },
        'Event handler registered'
      );
    });
  });

  describe('emit - event publishing', () => {
    it('should emit an event and call the handler', async () => {
      const handler = jest.fn();
      const user = createMockUser();
      const event: UserCreatedEvent = {
        name: EventName.USER_CREATED,
        timestamp: new Date(),
        traceId: 'trace-123',
        data: { user },
      };

      eventBus.on(EventName.USER_CREATED, handler);
      await eventBus.emit(event);

      // Give event emitter time to process
      await new Promise(resolve => setImmediate(resolve));

      expect(mockLogger.debug).toHaveBeenCalledWith(
        {
          eventName: event.name,
          traceId: event.traceId,
          timestamp: event.timestamp,
        },
        'Emitting event'
      );
      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should call all registered handlers for an event', async () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      const handler3 = jest.fn();
      const user = createMockUser();
      const event: UserCreatedEvent = {
        name: EventName.USER_CREATED,
        timestamp: new Date(),
        data: { user },
      };

      eventBus.on(EventName.USER_CREATED, handler1);
      eventBus.on(EventName.USER_CREATED, handler2);
      eventBus.on(EventName.USER_CREATED, handler3);

      await eventBus.emit(event);
      await new Promise(resolve => setImmediate(resolve));

      expect(handler1).toHaveBeenCalledWith(event);
      expect(handler2).toHaveBeenCalledWith(event);
      expect(handler3).toHaveBeenCalledWith(event);
    });

    it('should handle async handlers', async () => {
      const handler = jest.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });
      const user = createMockUser();
      const event: UserCreatedEvent = {
        name: EventName.USER_CREATED,
        timestamp: new Date(),
        data: { user },
      };

      eventBus.on(EventName.USER_CREATED, handler);
      await eventBus.emit(event);
      await new Promise(resolve => setImmediate(resolve));

      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should pass correct event data to handlers', async () => {
      const handler = jest.fn();
      const user = createMockUser({ id: 'specific-user-id', email: 'test@example.com' });
      const event: UserCreatedEvent = {
        name: EventName.USER_CREATED,
        timestamp: new Date('2024-01-15T10:00:00Z'),
        traceId: 'trace-456',
        data: { user },
      };

      eventBus.on(EventName.USER_CREATED, handler);
      await eventBus.emit(event);
      await new Promise(resolve => setImmediate(resolve));

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        name: EventName.USER_CREATED,
        timestamp: expect.any(Date),
        traceId: 'trace-456',
        data: expect.objectContaining({
          user: expect.objectContaining({
            id: 'specific-user-id',
            email: 'test@example.com',
          }),
        }),
      }));
    });

    it('should not call handlers for different events', async () => {
      const createdHandler = jest.fn();
      const updatedHandler = jest.fn();
      const user = createMockUser();
      const event: UserCreatedEvent = {
        name: EventName.USER_CREATED,
        timestamp: new Date(),
        data: { user },
      };

      eventBus.on(EventName.USER_CREATED, createdHandler);
      eventBus.on(EventName.USER_UPDATED, updatedHandler);

      await eventBus.emit(event);
      await new Promise(resolve => setImmediate(resolve));

      expect(createdHandler).toHaveBeenCalledWith(event);
      expect(updatedHandler).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should catch and log errors from handlers without crashing', async () => {
      const errorHandler = jest.fn(() => {
        throw new Error('Handler error');
      });
      const successHandler = jest.fn();
      const user = createMockUser();
      const event: UserCreatedEvent = {
        name: EventName.USER_CREATED,
        timestamp: new Date(),
        traceId: 'trace-789',
        data: { user },
      };

      eventBus.on(EventName.USER_CREATED, errorHandler);
      eventBus.on(EventName.USER_CREATED, successHandler);

      await eventBus.emit(event);
      await new Promise(resolve => setImmediate(resolve));

      expect(errorHandler).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: EventName.USER_CREATED,
          error: 'Handler error',
          traceId: 'trace-789',
        }),
        'Event handler failed'
      );
      // Other handlers should still be called
      expect(successHandler).toHaveBeenCalled();
    });

    it('should catch and log errors from async handlers', async () => {
      const errorHandler = jest.fn(async () => {
        throw new Error('Async handler error');
      });
      const user = createMockUser();
      const event: UserCreatedEvent = {
        name: EventName.USER_CREATED,
        timestamp: new Date(),
        traceId: 'trace-async',
        data: { user },
      };

      eventBus.on(EventName.USER_CREATED, errorHandler);
      await eventBus.emit(event);
      await new Promise(resolve => setImmediate(resolve));

      expect(errorHandler).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: EventName.USER_CREATED,
          error: 'Async handler error',
          traceId: 'trace-async',
          stack: expect.any(String),
        }),
        'Event handler failed'
      );
    });

    it('should continue processing other handlers when one fails', async () => {
      const handler1 = jest.fn();
      const errorHandler = jest.fn(() => {
        throw new Error('Middle handler error');
      });
      const handler3 = jest.fn();
      const user = createMockUser();
      const event: UserCreatedEvent = {
        name: EventName.USER_CREATED,
        timestamp: new Date(),
        data: { user },
      };

      eventBus.on(EventName.USER_CREATED, handler1);
      eventBus.on(EventName.USER_CREATED, errorHandler);
      eventBus.on(EventName.USER_CREATED, handler3);

      await eventBus.emit(event);
      await new Promise(resolve => setImmediate(resolve));

      expect(handler1).toHaveBeenCalled();
      expect(errorHandler).toHaveBeenCalled();
      expect(handler3).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledTimes(1);
    });
  });

  describe('different event types', () => {
    it('should handle UserUpdatedEvent correctly', async () => {
      const handler = jest.fn();
      const user = createMockUser();
      const oldUser = createMockUser({ email: 'old@example.com' });
      const event: UserUpdatedEvent = {
        name: EventName.USER_UPDATED,
        timestamp: new Date(),
        traceId: 'trace-update',
        data: {
          user,
          oldUser,
          changes: { email: 'john@example.com' },
        },
      };

      eventBus.on(EventName.USER_UPDATED, handler);
      await eventBus.emit(event);
      await new Promise(resolve => setImmediate(resolve));

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        name: EventName.USER_UPDATED,
        data: expect.objectContaining({
          user,
          oldUser,
          changes: { email: 'john@example.com' },
        }),
      }));
    });

    it('should handle UserDeletedEvent correctly', async () => {
      const handler = jest.fn();
      const event: UserDeletedEvent = {
        name: EventName.USER_DELETED,
        timestamp: new Date(),
        traceId: 'trace-delete',
        data: {
          userId: 'user-123',
        },
      };

      eventBus.on(EventName.USER_DELETED, handler);
      await eventBus.emit(event);
      await new Promise(resolve => setImmediate(resolve));

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        name: EventName.USER_DELETED,
        data: { userId: 'user-123' },
      }));
    });
  });

  describe('traceId handling', () => {
    it('should handle events without traceId', async () => {
      const handler = jest.fn();
      const user = createMockUser();
      const event: UserCreatedEvent = {
        name: EventName.USER_CREATED,
        timestamp: new Date(),
        data: { user },
      };

      eventBus.on(EventName.USER_CREATED, handler);
      await eventBus.emit(event);
      await new Promise(resolve => setImmediate(resolve));

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: event.name,
          traceId: undefined,
        }),
        'Emitting event'
      );
      expect(handler).toHaveBeenCalled();
    });

    it('should pass traceId to error logger when handler fails', async () => {
      const errorHandler = jest.fn(() => {
        throw new Error('Test error');
      });
      const user = createMockUser();
      const event: UserCreatedEvent = {
        name: EventName.USER_CREATED,
        timestamp: new Date(),
        traceId: 'trace-error-test',
        data: { user },
      };

      eventBus.on(EventName.USER_CREATED, errorHandler);
      await eventBus.emit(event);
      await new Promise(resolve => setImmediate(resolve));

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          traceId: 'trace-error-test',
        }),
        'Event handler failed'
      );
    });
  });

  describe('handler management', () => {
    it('should track handler count correctly', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      eventBus.on(EventName.USER_CREATED, handler1);
      expect(mockLogger.debug).toHaveBeenLastCalledWith(
        { eventName: EventName.USER_CREATED, handlerCount: 1 },
        'Event handler registered'
      );

      eventBus.on(EventName.USER_CREATED, handler2);
      expect(mockLogger.debug).toHaveBeenLastCalledWith(
        { eventName: EventName.USER_CREATED, handlerCount: 2 },
        'Event handler registered'
      );
    });

    it('should allow same handler to be registered multiple times', () => {
      const handler = jest.fn();

      eventBus.on(EventName.USER_CREATED, handler);
      eventBus.on(EventName.USER_CREATED, handler);

      expect(mockLogger.debug).toHaveBeenCalledTimes(2);
      expect(mockLogger.debug).toHaveBeenLastCalledWith(
        { eventName: EventName.USER_CREATED, handlerCount: 2 },
        'Event handler registered'
      );
    });
  });

  describe('integration scenarios', () => {
    it('should handle complex event flow with multiple events and handlers', async () => {
      const userCreatedHandler1 = jest.fn();
      const userCreatedHandler2 = jest.fn();
      const userUpdatedHandler = jest.fn();
      const userDeletedHandler = jest.fn();

      const user = createMockUser();

      // Register handlers
      eventBus.on(EventName.USER_CREATED, userCreatedHandler1);
      eventBus.on(EventName.USER_CREATED, userCreatedHandler2);
      eventBus.on(EventName.USER_UPDATED, userUpdatedHandler);
      eventBus.on(EventName.USER_DELETED, userDeletedHandler);

      // Emit multiple events
      const createdEvent: UserCreatedEvent = {
        name: EventName.USER_CREATED,
        timestamp: new Date(),
        data: { user },
      };
      await eventBus.emit(createdEvent);

      const updatedEvent: UserUpdatedEvent = {
        name: EventName.USER_UPDATED,
        timestamp: new Date(),
        data: {
          user,
          oldUser: user,
          changes: {},
        },
      };
      await eventBus.emit(updatedEvent);

      const deletedEvent: UserDeletedEvent = {
        name: EventName.USER_DELETED,
        timestamp: new Date(),
        data: { userId: user.id },
      };
      await eventBus.emit(deletedEvent);

      await new Promise(resolve => setImmediate(resolve));

      expect(userCreatedHandler1).toHaveBeenCalledTimes(1);
      expect(userCreatedHandler2).toHaveBeenCalledTimes(1);
      expect(userUpdatedHandler).toHaveBeenCalledTimes(1);
      expect(userDeletedHandler).toHaveBeenCalledTimes(1);
    });
  });
});

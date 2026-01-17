import { EventEmitter } from 'events';
import { logger } from '@/config/logger';
import { DomainEvent, EventHandler, EventName } from './event.types';

class EventBus {
  private emitter: EventEmitter;
  private handlers: Map<EventName, EventHandler[]>;

  constructor() {
    this.emitter = new EventEmitter();
    this.handlers = new Map();
    this.emitter.setMaxListeners(50);
  }

  /**
   * Subscribe to an event
   */
  on = <T extends DomainEvent>(eventName: EventName, handler: EventHandler<T>): void => {
    const handlers = this.handlers.get(eventName) || [];
    handlers.push(handler as EventHandler);
    this.handlers.set(eventName, handlers);

    this.emitter.on(eventName, async (event: T) => {
      try {
        await handler(event);
      } catch (error) {
        logger.error(
          {
            eventName,
            error: (error as Error).message,
            stack: (error as Error).stack,
            traceId: event.traceId,
          },
          'Event handler failed'
        );
      }
    });

    logger.debug({ eventName, handlerCount: handlers.length }, 'Event handler registered');
  };

  /**
   * Emit an event
   */
  emit = async <T extends DomainEvent>(event: T): Promise<void> => {
    logger.debug(
      {
        eventName: event.name,
        traceId: event.traceId,
        timestamp: event.timestamp,
      },
      'Emitting event'
    );

    this.emitter.emit(event.name, event);
  };
}

export const eventBus = new EventBus();

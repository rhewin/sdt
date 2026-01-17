import 'tsconfig-paths/register';
import 'reflect-metadata';
import express, { Express } from 'express';
import { config } from 'dotenv';
import { traceMiddleware } from '@/middleware/trace';
import { errorHandler, notFoundHandler } from '@/middleware/error-handler';
import { notificationEventSubscriber } from '@/infra/notification/notification.events';
import v1Router from '@/routes/v1';

config();

export function createApp(): Express {
  const app = express();

  // Register event subscribers for domain events
  notificationEventSubscriber.register();

  // Body parsing middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Trace ID middleware
  app.use(traceMiddleware);

  // API routes
  app.use('/api/v1', v1Router);

  // 404 handler
  app.use(notFoundHandler);

  // Error handling middleware (must be last)
  app.use(errorHandler);

  return app;
}

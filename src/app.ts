import 'tsconfig-paths/register';
import 'reflect-metadata';
import express, { Express } from 'express';
import { config } from 'dotenv';
import { traceMiddleware } from '@/middleware/trace';
import { errorHandler, notFoundHandler } from '@/middleware/errorHandler';
import router from '@/router';

config();

export function createApp(): Express {
  const app = express();

  // Body parsing middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Trace ID middleware
  app.use(traceMiddleware);

  // API routes
  app.use(router);

  // 404 handler
  app.use(notFoundHandler);

  // Error handling middleware (must be last)
  app.use(errorHandler);

  return app;
}

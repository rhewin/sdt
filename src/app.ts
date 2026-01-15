import 'reflect-metadata';
import express, { Express } from 'express';
import { config } from 'dotenv';
import userRoutes from './routes/userRoutes';
import { traceMiddleware } from './middleware/trace';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { AppDataSource } from './config/database';

config();

export function createApp(): Express {
  const app = express();

  // Body parsing middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Trace ID middleware (must be first)
  app.use(traceMiddleware);

  // Health check endpoint
  app.get('/health', (req, res) => {
    const healthCheck = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: AppDataSource.isInitialized ? 'connected' : 'disconnected',
      trace_id: req.trace_id,
    };
    res.status(200).json(healthCheck);
  });

  // API routes
  app.use(userRoutes);

  // 404 handler
  app.use(notFoundHandler);

  // Error handling middleware (must be last)
  app.use(errorHandler);

  return app;
}

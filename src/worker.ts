import 'tsconfig-paths/register';
import 'reflect-metadata';
import { config } from 'dotenv';
import { initializeDatabase, closeDatabase } from './config/database';
import { closeRedis } from './config/redis';
import { BirthdayWorker } from './queues/workers/birthdayWorker';
import { HourlySchedulerService } from './services/HourlySchedulerService';
import { logger } from './config/logger';

config();

async function startWorker() {
  try {
    await initializeDatabase();
    logger.info('Database initialized for worker');

    // Create worker instance
    const worker = new BirthdayWorker();
    logger.info('Birthday worker initialized and ready to process jobs');

    // Start hourly scheduler
    const scheduler = new HourlySchedulerService();
    scheduler.start();
    logger.info('Hourly scheduler started');

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info({ signal }, 'Shutdown signal received. Starting graceful shutdown...');

      try {
        // Stop scheduler
        scheduler.stop();
        logger.info('Scheduler stopped');

        // Close worker
        await worker.close();
        logger.info('Worker closed');

        await closeDatabase();
        await closeRedis();

        logger.info('All connections closed. Exiting...');
        process.exit(0);
      } catch (error) {
        logger.error({ error }, 'Error during graceful shutdown');
        process.exit(1);
      }
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    logger.info('Worker and scheduler ready');
  } catch (error) {
    logger.error({ error }, 'Failed to start worker');
    process.exit(1);
  }
}

startWorker();

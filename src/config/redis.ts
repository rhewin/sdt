import Redis from 'ioredis';
import { config } from 'dotenv';
import { logger } from './logger';

config();

export const redisConnection = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null, // Required for BullMQ
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redisConnection.on('connect', () => {
  logger.info('Redis connection established');
});

redisConnection.on('error', (error) => {
  logger.error({ error: error.message }, 'Redis connection error');
});

export const closeRedis = async (): Promise<void> => {
  await redisConnection.quit();
  logger.info('Redis connection closed');
}

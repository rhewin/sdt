import Redis from 'ioredis';
import { config } from 'dotenv';

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
  console.log('Redis connection established');
});

redisConnection.on('error', (error) => {
  console.error('Redis connection error:', error);
});

export async function closeRedis(): Promise<void> {
  await redisConnection.quit();
  console.log('Redis connection closed');
}

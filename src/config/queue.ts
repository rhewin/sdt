import { Queue, QueueOptions } from 'bullmq';
import { redisConnection } from './redis';
import { config } from 'dotenv';
import { logger } from './logger';
import { MAX_RETRY_ATTEMPTS, RETRY_BACKOFF_DELAY } from './constants';

config();

const queueOptions: QueueOptions = {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: parseInt(process.env.QUEUE_MAX_RETRIES || String(MAX_RETRY_ATTEMPTS)),
    backoff: {
      type: 'exponential',
      delay: RETRY_BACKOFF_DELAY, // 2s, 4s, 8s, 16s, 32s
    },
    removeOnComplete: {
      age: 86400, // Keep completed jobs for 24 hours
      count: 10000, // Keep max 10000 completed jobs
    },
    removeOnFail: {
      age: 604800, // Keep failed jobs for 7 days for analysis
    },
  },
};

export const birthdayQueue = new Queue('birthday-messages', queueOptions);

// Queue events for monitoring
birthdayQueue.on('error', error => {
  logger.error({ error: error.message }, 'Queue error');
});

birthdayQueue.on('waiting', jobId => {
  logger.debug({ jobId }, 'Job is waiting');
});

import { Worker, Job } from 'bullmq';
import { redisConnection } from '@/config/redis';
import { UserRepository } from '@/repositories/UserRepository';
import { MessageLogRepository } from '@/repositories/MessageLogRepository';
import { EmailService } from '@/services/EmailService';
import { MessageStatus } from '@/models/MessageLog';
import { BirthdayMessageData } from '@/shared/types';
import { logCriticalOperation, logError, logger } from '@/config/logger';

export class BirthdayWorker {
  private worker: Worker;
  private userRepository: UserRepository;
  private messageLogRepository: MessageLogRepository;
  private emailService: EmailService;

  constructor() {
    this.userRepository = new UserRepository();
    this.messageLogRepository = new MessageLogRepository();
    this.emailService = new EmailService();

    const concurrency = parseInt(process.env.QUEUE_CONCURRENCY || '5');

    this.worker = new Worker(
      'birthday-messages',
      async (job: Job<BirthdayMessageData>) => {
        return await this.processJob(job);
      },
      {
        connection: redisConnection,
        concurrency,
      }
    );

    // Worker event handlers
    this.worker.on('completed', (job) => {
      const trace_id = job.data.trace_id || 'worker';
      logCriticalOperation(trace_id, 'job_completed', {
        jobId: job.id,
        userId: job.data.userId,
        duration: job.finishedOn ? job.finishedOn - (job.processedOn || 0) : 0,
      });
    });

    this.worker.on('failed', (job, error) => {
      const trace_id = job?.data.trace_id || 'worker';
      logError(trace_id, error as Error, {
        jobId: job?.id,
        userId: job?.data.userId,
        attemptsMade: job?.attemptsMade,
      });
    });

    this.worker.on('error', (error) => {
      logger.error({ error: error.message, stack: error.stack }, 'Worker error');
    });
  }

  private processJob = async (job: Job<BirthdayMessageData>): Promise<{ success: boolean; skipped?: boolean }> => {
    const { userId, scheduledFor, trace_id = 'worker' } = job.data;

    logCriticalOperation(trace_id, 'job_processing_started', {
      jobId: job.id,
      userId,
      scheduledFor,
      attempt: job.attemptsMade + 1,
    });

    try {
      // 1. Look up existing message log (should already exist from user creation)
      const idempotencyKey = job.id || `${userId}:birthday:${new Date(scheduledFor).toISOString().split('T')[0]}`;

      const messageLog = await this.messageLogRepository.findByIdempotencyKey(idempotencyKey);

      if (!messageLog) {
        throw new Error(`Message log not found for idempotency key: ${idempotencyKey}`);
      }

      // 2. Check if already sent (race condition protection)
      if (messageLog.status === MessageStatus.SENT) {
        logCriticalOperation(trace_id, 'message_already_sent', {
          jobId: job.id,
          messageLogId: messageLog.id,
          userId,
        });
        return { success: true, skipped: true };
      }

      // 3. Update status to processing
      await this.messageLogRepository.updateStatus(messageLog.id, MessageStatus.PROCESSING);

      // 4. Get user data
      const user = await this.userRepository.findById(userId);
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      // Check if user is deleted
      if (user.deletedAt) {
        logCriticalOperation(trace_id, 'user_deleted_skip_message', {
          userId,
          messageLogId: messageLog.id,
        });
        return { success: true, skipped: true };
      }

      // 5. Send birthday message
      await this.emailService.sendBirthdayMessage(user, trace_id);

      // 6. Update message log as sent
      await this.messageLogRepository.updateStatus(messageLog.id, MessageStatus.SENT);

      logCriticalOperation(trace_id, 'message_sent_successfully', {
        jobId: job.id,
        userId,
        messageLogId: messageLog.id,
        email: user.email,
      });

      return { success: true };
    } catch (error) {
      const errorMessage = (error as Error).message;
      const shouldRetry = (error as Error & { shouldRetry?: boolean }).shouldRetry;

      logError(trace_id, error as Error, {
        jobId: job.id,
        userId,
        attemptsMade: job.attemptsMade + 1,
        shouldRetry,
      });

      // Try to update message log status
      try {
        const idempotencyKey = job.id || `${userId}:birthday:${new Date(scheduledFor).toISOString().split('T')[0]}`;
        const messageLog = await this.messageLogRepository.findByIdempotencyKey(idempotencyKey);

        if (messageLog) {
          // Check if this is a permanent failure (400 errors)
          if (shouldRetry === false) {
            // Mark as permanently failed with error message
            await this.messageLogRepository.updateStatus(messageLog.id, MessageStatus.FAILED, errorMessage);

            logCriticalOperation(trace_id, 'message_permanently_failed', {
              jobId: job.id,
              userId,
              messageLogId: messageLog.id,
              errorMessage,
              reason: '400 client error - not retryable',
            });

            // Return success to prevent BullMQ from retrying
            return { success: false };
          }

          // For retriable errors (500, timeout, or undefined)
          const maxAttempts = parseInt(process.env.QUEUE_MAX_RETRIES || '5');
          const status = (job.attemptsMade + 1) >= maxAttempts ? MessageStatus.FAILED : MessageStatus.RETRYING;
          await this.messageLogRepository.updateStatus(messageLog.id, status, errorMessage);
        }
      } catch (updateError) {
        logError(trace_id, updateError as Error, {
          context: 'Failed to update message log after error',
        });
      }

      // Re-throw to let BullMQ handle retry (only for retriable errors)
      throw error;
    }
  }

  close = async (): Promise<void> => {
    await this.worker.close();
    logger.info('Birthday worker closed');
  }
}

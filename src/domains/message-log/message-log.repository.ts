import { LessThan, In, Repository } from 'typeorm';
import { AppDataSource } from '@/config/database';
import { MessageLog, MessageStatus } from '@/domains/message-log/message-log.model';
import { CreateMessageLogDto, UpdateMessageLogDto } from './message-log.types';

export class MessageLogRepository {
  private _repository: Repository<MessageLog> | null = null;

  private get repository(): Repository<MessageLog> {
    if (!this._repository) {
      this._repository = AppDataSource.getRepository(MessageLog);
    }
    return this._repository;
  }

  create = async (data: CreateMessageLogDto): Promise<MessageLog> => {
    const messageLog = this.repository.create(data);
    return await this.repository.save(messageLog);
  };

  findByIdempotencyKey = async (idempotencyKey: string): Promise<MessageLog | null> => {
    return await this.repository.findOne({
      where: { idempotencyKey },
    });
  };

  findById = async (id: string): Promise<MessageLog | null> => {
    return await this.repository.findOne({
      where: { id },
      relations: ['user'],
    });
  };

  updateStatus = async (
    id: string,
    status: MessageStatus,
    errorMessage?: string
  ): Promise<MessageLog | null> => {
    const messageLog = await this.findById(id);
    if (!messageLog) {
      return null;
    }

    messageLog.status = status;
    messageLog.attemptCount += 1;
    messageLog.lastAttemptAt = new Date();

    if (status === MessageStatus.SENT) {
      messageLog.sentAt = new Date();
      messageLog.errorMessage = undefined;
    } else if (status === MessageStatus.FAILED || status === MessageStatus.RETRYING) {
      messageLog.errorMessage = errorMessage;
    }

    return await this.repository.save(messageLog);
  };

  update = async (id: string, data: UpdateMessageLogDto): Promise<MessageLog | null> => {
    const messageLog = await this.findById(id);
    if (!messageLog) {
      return null;
    }

    Object.assign(messageLog, data);
    return await this.repository.save(messageLog);
  };

  findUnsentMessages = async (cutoffTime: Date): Promise<MessageLog[]> => {
    return await this.repository.find({
      where: {
        scheduledFor: LessThan(cutoffTime),
        status: In([MessageStatus.PENDING, MessageStatus.FAILED, MessageStatus.RETRYING]),
      },
      relations: ['user'],
    });
  };

  createOrGet = async (data: CreateMessageLogDto): Promise<MessageLog> => {
    const existing = await this.findByIdempotencyKey(data.idempotencyKey);
    if (existing) {
      return existing;
    }
    return await this.create(data);
  };

  findPendingForDate = async (date: Date): Promise<MessageLog[]> => {
    // Format date as YYYY-MM-DD for comparison
    const dateStr = date.toISOString().split('T')[0];

    // Use find() with in-memory filtering
    // Query builder would be more efficient, but this works reliably across all TypeORM versions
    return await this.repository
      .find({
        where: {
          status: MessageStatus.PENDING,
        },
        relations: ['user'],
      })
      .then(messages => {
        return messages.filter(msg => {
          const msgDate =
            msg.scheduledDate instanceof Date ? msg.scheduledDate : new Date(msg.scheduledDate);
          const msgDateStr = msgDate.toISOString().split('T')[0];
          return msgDateStr === dateStr;
        });
      });
  };
}

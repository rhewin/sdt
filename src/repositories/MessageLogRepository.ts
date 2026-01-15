import { Repository, LessThan, In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { MessageLog, MessageStatus } from '../models/MessageLog';

export class MessageLogRepository {
  private repository: Repository<MessageLog>;

  constructor() {
    this.repository = AppDataSource.getRepository(MessageLog);
  }

  async create(data: {
    userId: string;
    messageType: string;
    scheduledDate: Date;
    scheduledFor: Date;
    idempotencyKey: string;
  }): Promise<MessageLog> {
    const messageLog = this.repository.create(data);
    return await this.repository.save(messageLog);
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<MessageLog | null> {
    return await this.repository.findOne({
      where: { idempotencyKey },
    });
  }

  async findById(id: string): Promise<MessageLog | null> {
    return await this.repository.findOne({
      where: { id },
      relations: ['user'],
    });
  }

  async updateStatus(
    id: string,
    status: MessageStatus,
    errorMessage?: string
  ): Promise<MessageLog | null> {
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
  }

  async findUnsentMessages(cutoffTime: Date): Promise<MessageLog[]> {
    return await this.repository.find({
      where: {
        scheduledFor: LessThan(cutoffTime),
        status: In([MessageStatus.PENDING, MessageStatus.FAILED, MessageStatus.RETRYING]),
      },
      relations: ['user'],
    });
  }

  async createOrGet(data: {
    userId: string;
    messageType: string;
    scheduledDate: Date;
    scheduledFor: Date;
    idempotencyKey: string;
  }): Promise<MessageLog> {
    const existing = await this.findByIdempotencyKey(data.idempotencyKey);
    if (existing) {
      return existing;
    }
    return await this.create(data);
  }
}

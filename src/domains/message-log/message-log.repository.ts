import { Repository, LessThan, In } from 'typeorm';
import { AppDataSource } from '@/config/database';
import { MessageLog, MessageStatus } from './message-log.model';

export class MessageLogRepository {
  private repository: Repository<MessageLog>;

  constructor() {
    this.repository = AppDataSource.getRepository(MessageLog);
  }

  create = async (data: {
    userId: string;
    messageType: string;
    scheduledDate: Date;
    scheduledFor: Date;
    idempotencyKey: string;
  }): Promise<MessageLog> => {
    const messageLog = this.repository.create(data);
    return await this.repository.save(messageLog);
  }

  findByIdempotencyKey = async (idempotencyKey: string): Promise<MessageLog | null> => {
    return await this.repository.findOne({
      where: { idempotencyKey },
    });
  }

  findById = async (id: string): Promise<MessageLog | null> => {
    return await this.repository.findOne({
      where: { id },
      relations: ['user'],
    });
  }

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
  }

  update = async (id: string, data: Partial<MessageLog>): Promise<MessageLog | null> => {
    const messageLog = await this.findById(id);
    if (!messageLog) {
      return null;
    }

    Object.assign(messageLog, data);
    return await this.repository.save(messageLog);
  }

  findUnsentMessages = async (cutoffTime: Date): Promise<MessageLog[]> => {
    return await this.repository.find({
      where: {
        scheduledFor: LessThan(cutoffTime),
        status: In([MessageStatus.PENDING, MessageStatus.FAILED, MessageStatus.RETRYING]),
      },
      relations: ['user'],
    });
  }

  createOrGet = async (data: {
    userId: string;
    messageType: string;
    scheduledDate: Date;
    scheduledFor: Date;
    idempotencyKey: string;
  }): Promise<MessageLog> => {
    const existing = await this.findByIdempotencyKey(data.idempotencyKey);
    if (existing) {
      return existing;
    }
    return await this.create(data);
  }

  findPendingForDate = async (date: Date): Promise<MessageLog[]> => {
    // Format date as YYYY-MM-DD for comparison
    const dateStr = date.toISOString().split('T')[0];

    return await this.repository
      .createQueryBuilder('message_log')
      .where('message_log.status = :status', { status: MessageStatus.PENDING })
      .andWhere('DATE(message_log.scheduled_date) = :date', { date: dateStr })
      .leftJoinAndSelect('message_log.user', 'user')
      .getMany();
  }
}

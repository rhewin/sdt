import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '@/domains/user/user.model';

export enum MessageStatus {
  UNPROCESSED = 'unprocessed',
  PENDING = 'pending',
  PROCESSING = 'processing',
  SENT = 'sent',
  FAILED = 'failed',
  RETRYING = 'retrying',
}

@Entity('message_logs')
export class MessageLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar', length: 50, name: 'message_type', default: 'birthday' })
  messageType!: string;

  @Column({ type: 'date', name: 'scheduled_date' })
  scheduledDate!: Date;

  @Column({ type: 'timestamp with time zone', name: 'scheduled_for' })
  scheduledFor!: Date;

  @Column({ type: 'varchar', length: 255, name: 'idempotency_key', unique: true })
  idempotencyKey!: string;

  @Column({
    type: 'enum',
    enum: MessageStatus,
    default: MessageStatus.UNPROCESSED,
  })
  status!: MessageStatus;

  @Column({ type: 'integer', name: 'attempt_count', default: 0 })
  attemptCount!: number;

  @Column({ type: 'timestamp with time zone', name: 'last_attempt_at', nullable: true })
  lastAttemptAt?: Date;

  @Column({ type: 'timestamp with time zone', name: 'sent_at', nullable: true })
  sentAt?: Date;

  @Column({ type: 'text', name: 'error_message', nullable: true })
  errorMessage?: string;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updated_at' })
  updatedAt!: Date;
}

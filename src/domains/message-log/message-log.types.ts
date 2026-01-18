export interface CreateMessageLogDto {
  userId: string;
  messageType: string;
  scheduledDate: Date;
  scheduledFor: Date;
  idempotencyKey: string;
}

export interface UpdateMessageLogDto {
  status?: string;
  attemptCount?: number;
  lastAttemptAt?: Date;
  sentAt?: Date;
  errorMessage?: string;
  scheduledDate?: Date;
  scheduledFor?: Date;
}

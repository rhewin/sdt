// Message types
export interface BirthdayMessageData {
  userId: string;
  scheduledFor: Date;
  trace_id?: string;
}

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  trace_id?: string;
}

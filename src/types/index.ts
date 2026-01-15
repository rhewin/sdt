// User types
export interface CreateUserDto {
  firstName: string;
  lastName: string;
  email: string;
  birthDate: string; // ISO date string
  timezone: string; // IANA timezone
}

export interface UpdateUserDto {
  firstName?: string;
  lastName?: string;
  email?: string;
  birthDate?: string;
  timezone?: string;
}

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

// Express Request extension
export interface RequestWithTrace {
  trace_id: string;
  log: unknown; // Pino logger instance
}

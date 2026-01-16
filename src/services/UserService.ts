import { z } from 'zod';
import { DateTime } from 'luxon';
import { UserRepository } from '@/repositories/UserRepository';
import { MessageLogRepository } from '@/repositories/MessageLogRepository';
import { User } from '@/models/User';
import { CreateUserDto, UpdateUserDto } from '@/shared/types';
import { generateIdempotencyKey } from '@/shared/utils';
import { logCriticalOperation, logError, logger } from '@/config/logger';
import { BIRTHDAY_MESSAGE_HOUR } from '@/config/constants';

// Zod validation schemas
export const createUserSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().max(255),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Birth date must be in YYYY-MM-DD format'),
  timezone: z.string().min(1).max(50), // IANA timezone
});

export const updateUserSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: z.string().email().max(255).optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Birth date must be in YYYY-MM-DD format').optional(),
  timezone: z.string().min(1).max(50).optional(),
});

export class UserService {
  private userRepository: UserRepository;
  private messageLogRepository: MessageLogRepository;

  constructor() {
    this.userRepository = new UserRepository();
    this.messageLogRepository = new MessageLogRepository();
  }

  createUser = async (data: CreateUserDto): Promise<User> => {
    // Validate input
    const validatedData = createUserSchema.parse(data);

    // Validate if email already exists
    const existingUser = await this.userRepository.findByEmail(validatedData.email);
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Validate timezone (basic check)
    if (!this.isValidTimezone(validatedData.timezone)) {
      throw new Error('Invalid timezone. Please provide a valid IANA timezone (e.g., America/New_York)');
    }

    // Validate birth date is not in the future
    const birthDate = new Date(validatedData.birthDate);
    if (birthDate > new Date()) {
      throw new Error('Birth date cannot be in the future');
    }

    const user = await this.userRepository.create(validatedData);

    // Schedule birthday message if birthday hasn't passed this year
    await this.scheduleBirthdayMessage(user);

    return user;
  }

  /**
   * Create message_logs entry for user's birthday if it hasn't passed this year
   * Status depends on birthday date and current time:
   * - Birthday = today, before BIRTHDAY_MESSAGE_HOUR → 'pending'
   * - Birthday = today, after BIRTHDAY_MESSAGE_HOUR → 'pending' with error_message
   * - Birthday = future → 'unprocessed'
   */
  private scheduleBirthdayMessage = async (user: User): Promise<void> => {
    const trace_id = `user-creation-${user.id}-${Date.now()}`;

    try {
      // Extract birthday month and day
      const birthDate = user.birthDate instanceof Date
        ? DateTime.fromJSDate(user.birthDate)
        : DateTime.fromISO(user.birthDate as unknown as string);

      // Get today's date in user's timezone (no time)
      const todayInUserTz = DateTime.now().setZone(user.timezone);
      const todayDateOnly = todayInUserTz.set({
        hour: 0,
        minute: 0,
        second: 0,
        millisecond: 0
      });

      // Get birthday date for this year in user's timezone (no time)
      const birthdayDateThisYear = todayInUserTz.set({
        month: birthDate.month,
        day: birthDate.day,
        hour: 0,
        minute: 0,
        second: 0,
        millisecond: 0
      });

      logger.debug({
        trace_id,
        email: user.email,
        birthMonth: birthDate.month,
        birthDay: birthDate.day,
        birthdayDateThisYear: birthdayDateThisYear.toISODate(),
        todayDate: todayDateOnly.toISODate()
      }, 'Checking if message_logs entry should be created');

      // Birthday date has already passed this year - skip
      if (birthdayDateThisYear < todayDateOnly) {
        logger.debug({ trace_id, birthdayDate: birthdayDateThisYear.toISODate() }, 'Birthday date already passed this year, skipping');
        return;
      }

      // Calculate execution time (BIRTHDAY_MESSAGE_HOUR in user's timezone)
      const executionTime = todayInUserTz.set({
        month: birthDate.month,
        day: birthDate.day,
        hour: BIRTHDAY_MESSAGE_HOUR,
        minute: 0,
        second: 0,
        millisecond: 0
      });

      const executionTimeUtc = executionTime.toUTC();
      const scheduledDate = birthdayDateThisYear.toFormat('yyyy-MM-dd');
      const idempotencyKey = generateIdempotencyKey(user.id, 'birthday', new Date(scheduledDate));

      // Determine status and error message
      const isBirthdayToday = birthdayDateThisYear.equals(todayDateOnly);
      const now = DateTime.now();
      const executionTimePassed = executionTimeUtc < now;

      let status: 'unprocessed' | 'pending' = 'unprocessed';
      let errorMessage: string | undefined = undefined;

      if (isBirthdayToday) {
        status = 'pending';
        if (executionTimePassed) {
          errorMessage = 'User created after scheduled send time, requires manual trigger';
        }
      }

      // Create message log entry
      const messageLog = await this.messageLogRepository.createOrGet({
        userId: user.id,
        messageType: 'birthday',
        scheduledDate: new Date(scheduledDate),
        scheduledFor: executionTimeUtc.toJSDate(),
        idempotencyKey,
      });

      // Update status and error message if needed
      if (status === 'pending' || errorMessage) {
        await this.messageLogRepository.updateStatus(messageLog.id, status as any, errorMessage);
      }

      logCriticalOperation(trace_id, 'birthday_message_log_created', {
        userId: user.id,
        email: user.email,
        timezone: user.timezone,
        birthDate: `${birthDate.month}-${birthDate.day}`,
        scheduledFor: executionTimeUtc.toISO(),
        scheduledDate,
        status,
        errorMessage,
        messageLogId: messageLog.id,
      });

      logger.info({
        trace_id,
        userId: user.id,
        messageLogId: messageLog.id,
        scheduledFor: executionTimeUtc.toISO(),
        status,
        isBirthdayToday,
        executionTimePassed
      }, 'Message log entry created');
    } catch (error) {
      logger.error({
        trace_id,
        userId: user.id,
        error: (error as Error).message,
        stack: (error as Error).stack
      }, 'Failed to create message log entry');

      logError(trace_id, error as Error, {
        context: 'Failed to create message log entry for new user',
        userId: user.id,
      });
      // Don't throw - user creation should succeed even if message log creation fails
    }
  }

  getUserById = async (id: string): Promise<User> => {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }

  updateUser = async (id: string, data: UpdateUserDto): Promise<User> => {
    // Validate input
    const validatedData = updateUserSchema.parse(data);

    // Check if user exists
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new Error('User not found');
    }

    // Check email uniqueness if updating email
    if (validatedData.email && validatedData.email !== user.email) {
      const existingUser = await this.userRepository.findByEmail(validatedData.email);
      if (existingUser) {
        throw new Error('User with this email already exists');
      }
    }

    // Validate timezone if updating
    if (validatedData.timezone && !this.isValidTimezone(validatedData.timezone)) {
      throw new Error('Invalid timezone. Please provide a valid IANA timezone');
    }

    // Validate birth date if updating
    if (validatedData.birthDate) {
      const birthDate = new Date(validatedData.birthDate);
      if (birthDate > new Date()) {
        throw new Error('Birth date cannot be in the future');
      }
    }

    const updatedUser = await this.userRepository.update(id, validatedData);
    if (!updatedUser) {
      throw new Error('Failed to update user');
    }

    return updatedUser;
  }

  deleteUser = async (id: string): Promise<void> => {
    const success = await this.userRepository.softDelete(id);
    if (!success) {
      throw new Error('User not found or already deleted');
    }
  }

  getAllUsers = async (): Promise<User[]> => {
    return await this.userRepository.findAll();
  }

  // Basic timezone validation (check if timezone string follows IANA format)
  private isValidTimezone = (timezone: string): boolean => {
    try {
      // Use Intl.DateTimeFormat to validate timezone
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }
}

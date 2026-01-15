import { z } from 'zod';
import { UserRepository } from '../repositories/UserRepository';
import { User } from '../models/User';
import { CreateUserDto, UpdateUserDto } from '../types';

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

  constructor() {
    this.userRepository = new UserRepository();
  }

  async createUser(data: CreateUserDto): Promise<User> {
    // Validate input
    const validatedData = createUserSchema.parse(data);

    // Check if email already exists
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

    return await this.userRepository.create(validatedData);
  }

  async getUserById(id: string): Promise<User> {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }

  async updateUser(id: string, data: UpdateUserDto): Promise<User> {
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

  async deleteUser(id: string): Promise<void> {
    const success = await this.userRepository.softDelete(id);
    if (!success) {
      throw new Error('User not found or already deleted');
    }
  }

  async getAllUsers(): Promise<User[]> {
    return await this.userRepository.findAll();
  }

  // Basic timezone validation (check if timezone string follows IANA format)
  private isValidTimezone(timezone: string): boolean {
    try {
      // Use Intl.DateTimeFormat to validate timezone
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }
}

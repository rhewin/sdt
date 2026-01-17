import { CreateUserDto, UpdateUserDto } from '@/shared/types';
import { isValidTimezoneFormat } from '@/shared/utils';
import { eventBus } from '@/infra/events/event-bus';
import { EventName, UserCreatedEvent, UserUpdatedEvent } from '@/infra/events/event.types';
import { User } from './user.model';
import { UserRepository } from './user.repository';
import { createUserSchema, updateUserSchema } from './user.validation';


export class UserService {
  private userRepository: UserRepository;

  constructor() {
    this.userRepository = new UserRepository();
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
    if (!isValidTimezoneFormat(validatedData.timezone)) {
      throw new Error('Invalid timezone. Please provide a valid IANA timezone (e.g., America/New_York)');
    }

    // Validate birth date is not in the future
    const birthDate = new Date(validatedData.birthDate);
    if (birthDate > new Date()) {
      throw new Error('Birth date cannot be in the future');
    }

    const user = await this.userRepository.create(validatedData);

    // Emit user created event for notification scheduling
    await eventBus.emit<UserCreatedEvent>({
      name: EventName.USER_CREATED,
      timestamp: new Date(),
      data: { user },
    });

    return user;
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

    // Check if user exists and capture old state
    const oldUser = await this.userRepository.findById(id);
    if (!oldUser) {
      throw new Error('User not found');
    }

    // Check email uniqueness if updating email
    if (validatedData.email && validatedData.email !== oldUser.email) {
      const existingUser = await this.userRepository.findByEmail(validatedData.email);
      if (existingUser) {
        throw new Error('User with this email already exists');
      }
    }

    // Validate timezone if updating
    if (validatedData.timezone && !isValidTimezoneFormat(validatedData.timezone)) {
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

    // Emit user updated event with changes for notification scheduling
    await eventBus.emit<UserUpdatedEvent>({
      name: EventName.USER_UPDATED,
      timestamp: new Date(),
      data: {
        user: updatedUser,
        oldUser,
        changes: validatedData,
      },
    });

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
}

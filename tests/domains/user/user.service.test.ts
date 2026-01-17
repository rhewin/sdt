import { UserService } from '@/domains/user/user.service';
import { UserRepository } from '@/domains/user/user.repository';
import { eventBus } from '@/infra/events/event-bus';
import { EventName } from '@/infra/events/event.types';
import { User } from '@/domains/user/user.model';
import { CreateUserDto, UpdateUserDto } from '@/shared/types';

// Mock dependencies
jest.mock('@/domains/user/user.repository');
jest.mock('@/infra/events/event-bus');
jest.mock('@/shared/utils', () => ({
  isValidTimezoneFormat: jest.fn((tz: string) => {
    const validTimezones = ['America/New_York', 'Europe/London', 'Asia/Tokyo'];
    return validTimezones.includes(tz);
  }),
}));

describe('UserService', () => {
  let userService: UserService;
  let mockUserRepository: jest.Mocked<UserRepository>;
  let mockEventBus: jest.Mocked<typeof eventBus>;

  const createMockUser = (overrides?: Partial<User>): User => {
    const user: User = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      birthDate: new Date('1990-01-15'),
      timezone: 'America/New_York',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: undefined,
      getFullName: function() {
        return `${this.firstName} ${this.lastName}`;
      },
      ...overrides,
    };
    return user;
  };

  const mockUser = createMockUser();

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a new instance and mock its repository
    userService = new UserService();
    const serviceInternal = userService as unknown as { userRepository: UserRepository };
    mockUserRepository = serviceInternal.userRepository as jest.Mocked<UserRepository>;

    // Setup mocks for repository methods
    mockUserRepository.findByEmail = jest.fn();
    mockUserRepository.findById = jest.fn();
    mockUserRepository.create = jest.fn();
    mockUserRepository.update = jest.fn();
    mockUserRepository.softDelete = jest.fn();
    mockUserRepository.findAll = jest.fn();

    // Mock eventBus
    mockEventBus = eventBus as jest.Mocked<typeof eventBus>;
    mockEventBus.emit = jest.fn();
  });

  describe('createUser', () => {
    const validUserData: CreateUserDto = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      birthDate: '1990-01-15',
      timezone: 'America/New_York',
    };

    it('should create a user successfully', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockUserRepository.create.mockResolvedValue(mockUser);
      mockEventBus.emit.mockResolvedValue(undefined);

      const result = await userService.createUser(validUserData);

      expect(result).toEqual(mockUser);
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(validUserData.email);
      expect(mockUserRepository.create).toHaveBeenCalledWith(validUserData);
      expect(mockEventBus.emit).toHaveBeenCalledWith({
        name: EventName.USER_CREATED,
        timestamp: expect.any(Date),
        data: { user: mockUser },
      });
    });

    it('should throw error if email already exists', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(mockUser);

      await expect(userService.createUser(validUserData)).rejects.toThrow(
        'User with this email already exists'
      );

      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(validUserData.email);
      expect(mockUserRepository.create).not.toHaveBeenCalled();
      expect(mockEventBus.emit).not.toHaveBeenCalled();
    });

    it('should throw error for invalid timezone', async () => {
      const invalidData = { ...validUserData, timezone: 'Invalid/Timezone' };
      mockUserRepository.findByEmail.mockResolvedValue(null);

      await expect(userService.createUser(invalidData)).rejects.toThrow(
        'Invalid timezone. Please provide a valid IANA timezone (e.g., America/New_York)'
      );

      expect(mockUserRepository.create).not.toHaveBeenCalled();
      expect(mockEventBus.emit).not.toHaveBeenCalled();
    });

    it('should throw error for future birth date', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const invalidData = { ...validUserData, birthDate: futureDate.toISOString().split('T')[0] };
      mockUserRepository.findByEmail.mockResolvedValue(null);

      await expect(userService.createUser(invalidData)).rejects.toThrow(
        'Birth date cannot be in the future'
      );

      expect(mockUserRepository.create).not.toHaveBeenCalled();
      expect(mockEventBus.emit).not.toHaveBeenCalled();
    });

    it('should throw validation error for invalid email', async () => {
      const invalidData = { ...validUserData, email: 'invalid-email' };

      await expect(userService.createUser(invalidData)).rejects.toThrow();
    });

    it('should throw validation error for empty first name', async () => {
      const invalidData = { ...validUserData, firstName: '' };

      await expect(userService.createUser(invalidData)).rejects.toThrow();
    });

    it('should throw validation error for invalid birth date format', async () => {
      const invalidData = { ...validUserData, birthDate: '01/15/1990' };

      await expect(userService.createUser(invalidData)).rejects.toThrow();
    });
  });

  describe('getUserById', () => {
    it('should return user when found', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);

      const result = await userService.getUserById(mockUser.id);

      expect(result).toEqual(mockUser);
      expect(mockUserRepository.findById).toHaveBeenCalledWith(mockUser.id);
    });

    it('should throw error when user not found', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(userService.getUserById('non-existent-id')).rejects.toThrow('User not found');

      expect(mockUserRepository.findById).toHaveBeenCalledWith('non-existent-id');
    });
  });

  describe('updateUser', () => {
    const updateData: UpdateUserDto = {
      firstName: 'Jane',
      email: 'jane@example.com',
    };

    const updatedUser = createMockUser({
      id: mockUser.id,
      firstName: updateData.firstName || mockUser.firstName,
      lastName: mockUser.lastName,
      email: updateData.email || mockUser.email,
      birthDate: mockUser.birthDate,
      timezone: mockUser.timezone,
      createdAt: mockUser.createdAt,
      updatedAt: mockUser.updatedAt,
    });

    it('should update user successfully', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockUserRepository.update.mockResolvedValue(updatedUser);
      mockEventBus.emit.mockResolvedValue(undefined);

      const result = await userService.updateUser(mockUser.id, updateData);

      expect(result).toEqual(updatedUser);
      expect(mockUserRepository.findById).toHaveBeenCalledWith(mockUser.id);
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(updateData.email);
      expect(mockUserRepository.update).toHaveBeenCalledWith(mockUser.id, updateData);
      expect(mockEventBus.emit).toHaveBeenCalledWith({
        name: EventName.USER_UPDATED,
        timestamp: expect.any(Date),
        data: {
          user: updatedUser,
          oldUser: mockUser,
          changes: updateData,
        },
      });
    });

    it('should throw error when user not found', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(userService.updateUser('non-existent-id', updateData)).rejects.toThrow(
        'User not found'
      );

      expect(mockUserRepository.update).not.toHaveBeenCalled();
      expect(mockEventBus.emit).not.toHaveBeenCalled();
    });

    it('should throw error when updating to existing email', async () => {
      const anotherUser = createMockUser({ id: 'different-id' });
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockUserRepository.findByEmail.mockResolvedValue(anotherUser);

      await expect(userService.updateUser(mockUser.id, updateData)).rejects.toThrow(
        'User with this email already exists'
      );

      expect(mockUserRepository.update).not.toHaveBeenCalled();
      expect(mockEventBus.emit).not.toHaveBeenCalled();
    });

    it('should allow updating to same email', async () => {
      const sameEmailUpdate = { ...updateData, email: mockUser.email };
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockUserRepository.update.mockResolvedValue(mockUser);
      mockEventBus.emit.mockResolvedValue(undefined);

      await userService.updateUser(mockUser.id, sameEmailUpdate);

      expect(mockUserRepository.findByEmail).not.toHaveBeenCalled();
      expect(mockUserRepository.update).toHaveBeenCalledWith(mockUser.id, sameEmailUpdate);
    });

    it('should throw error for invalid timezone', async () => {
      const invalidData = { timezone: 'Invalid/Timezone' };
      mockUserRepository.findById.mockResolvedValue(mockUser);

      await expect(userService.updateUser(mockUser.id, invalidData)).rejects.toThrow(
        'Invalid timezone. Please provide a valid IANA timezone'
      );

      expect(mockUserRepository.update).not.toHaveBeenCalled();
      expect(mockEventBus.emit).not.toHaveBeenCalled();
    });

    it('should throw error for future birth date', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const invalidData = { birthDate: futureDate.toISOString().split('T')[0] };
      mockUserRepository.findById.mockResolvedValue(mockUser);

      await expect(userService.updateUser(mockUser.id, invalidData)).rejects.toThrow(
        'Birth date cannot be in the future'
      );

      expect(mockUserRepository.update).not.toHaveBeenCalled();
      expect(mockEventBus.emit).not.toHaveBeenCalled();
    });

    it('should throw error when update fails', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockUserRepository.update.mockResolvedValue(null);

      await expect(userService.updateUser(mockUser.id, updateData)).rejects.toThrow(
        'Failed to update user'
      );

      expect(mockEventBus.emit).not.toHaveBeenCalled();
    });

    it('should throw validation error for invalid email format', async () => {
      const invalidData = { email: 'invalid-email' };
      mockUserRepository.findById.mockResolvedValue(mockUser);

      await expect(userService.updateUser(mockUser.id, invalidData)).rejects.toThrow();
    });
  });

  describe('deleteUser', () => {
    it('should delete user successfully', async () => {
      mockUserRepository.softDelete.mockResolvedValue(true);

      await userService.deleteUser(mockUser.id);

      expect(mockUserRepository.softDelete).toHaveBeenCalledWith(mockUser.id);
    });

    it('should throw error when user not found', async () => {
      mockUserRepository.softDelete.mockResolvedValue(false);

      await expect(userService.deleteUser('non-existent-id')).rejects.toThrow(
        'User not found or already deleted'
      );

      expect(mockUserRepository.softDelete).toHaveBeenCalledWith('non-existent-id');
    });
  });

  describe('getAllUsers', () => {
    it('should return all users', async () => {
      const users = [mockUser, createMockUser({ id: 'another-id', email: 'another@example.com' })];
      mockUserRepository.findAll.mockResolvedValue(users);

      const result = await userService.getAllUsers();

      expect(result).toEqual(users);
      expect(mockUserRepository.findAll).toHaveBeenCalled();
    });

    it('should return empty array when no users exist', async () => {
      mockUserRepository.findAll.mockResolvedValue([]);

      const result = await userService.getAllUsers();

      expect(result).toEqual([]);
      expect(mockUserRepository.findAll).toHaveBeenCalled();
    });
  });
});

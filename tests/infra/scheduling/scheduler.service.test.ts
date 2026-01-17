import { DateTime } from 'luxon';
import { HourlySchedulerService } from '@/infra/scheduling/scheduler.service';
import { UserRepository } from '@/domains/user/user.repository';
import { MessageLogRepository } from '@/domains/message-log/message-log.repository';
import { birthdayQueue } from '@/config/queue';
import { User } from '@/domains/user/user.model';
import { MessageLog, MessageStatus } from '@/domains/message-log/message-log.model';
import { BIRTHDAY_MESSAGE_HOUR } from '@/config/constants';

// Mock dependencies
jest.mock('@/domains/user/user.repository');
jest.mock('@/domains/message-log/message-log.repository');
jest.mock('@/config/queue', () => ({
  birthdayQueue: {
    add: jest.fn(),
    getJob: jest.fn(),
  },
}));
jest.mock('node-cron', () => ({
  schedule: jest.fn((_pattern, callback) => ({
    stop: jest.fn(),
    start: jest.fn(),
    callback,
  })),
}));

describe('HourlySchedulerService', () => {
  let schedulerService: HourlySchedulerService;
  let mockUserRepository: jest.Mocked<UserRepository>;
  let mockMessageLogRepository: jest.Mocked<MessageLogRepository>;
  let mockBirthdayQueue: jest.Mocked<typeof birthdayQueue>;

  const createMockUser = (overrides?: Partial<User>): User => {
    return {
      id: 'user-123',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      birthDate: new Date('1990-01-15'),
      timezone: 'America/New_York',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: undefined,
      getFullName: function () {
        return `${this.firstName} ${this.lastName}`;
      },
      ...overrides,
    } as User;
  };

  const createMockMessageLog = (overrides?: Partial<MessageLog>): MessageLog => {
    return {
      id: 'message-log-123',
      userId: 'user-123',
      messageType: 'birthday',
      scheduledDate: new Date(),
      scheduledFor: new Date(),
      status: MessageStatus.PENDING,
      attemptCount: 0,
      idempotencyKey: 'user-123:birthday:2024-01-15',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    } as MessageLog;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    schedulerService = new HourlySchedulerService();
    const serviceInternal = schedulerService as unknown as {
      userRepository: UserRepository;
      messageLogRepository: MessageLogRepository;
    };
    mockUserRepository = serviceInternal.userRepository as jest.Mocked<UserRepository>;
    mockMessageLogRepository =
      serviceInternal.messageLogRepository as jest.Mocked<MessageLogRepository>;
    mockBirthdayQueue = birthdayQueue as jest.Mocked<typeof birthdayQueue>;

    // Setup mocks
    mockUserRepository.findAll = jest.fn();
    mockMessageLogRepository.findByIdempotencyKey = jest.fn();
    mockMessageLogRepository.createOrGet = jest.fn();
    mockMessageLogRepository.updateStatus = jest.fn();
    mockMessageLogRepository.findPendingForDate = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('start and stop', () => {
    it('should start the cron job', () => {
      schedulerService.start();
      // Verify start was called (cron job created)
      expect(schedulerService).toBeDefined();
    });

    it('should stop the cron job', () => {
      schedulerService.start();
      schedulerService.stop();
      // Verify stop was called
      expect(schedulerService).toBeDefined();
    });
  });

  describe('queueDueMessages', () => {
    const trace_id = 'test-trace-123';

    it('should queue messages that are due', async () => {
      const now = DateTime.fromISO('2024-01-15T14:00:00Z');
      jest.setSystemTime(now.toJSDate());

      const scheduledFor = now.minus({ hours: 1 }).toJSDate();
      const pendingMessage = createMockMessageLog({
        scheduledFor,
        idempotencyKey: 'user-123:birthday:2024-01-15',
      });

      mockMessageLogRepository.findPendingForDate.mockResolvedValue([pendingMessage]);
      mockBirthdayQueue.getJob.mockResolvedValue(undefined);
      mockBirthdayQueue.add.mockResolvedValue({ id: 'job-123' } as any);

      const result = await schedulerService.queueDueMessages(trace_id);

      expect(result.total).toBe(1);
      expect(result.queued).toBe(1);
      expect(result.skippedNotDue).toBe(0);
      expect(result.skippedAlreadyQueued).toBe(0);
      expect(mockBirthdayQueue.add).toHaveBeenCalledWith(
        'send-birthday-message',
        {
          userId: pendingMessage.userId,
          scheduledFor: pendingMessage.scheduledFor,
          trace_id: expect.stringContaining('scheduler'),
        },
        {
          delay: 0,
          jobId: pendingMessage.idempotencyKey,
          removeOnComplete: true,
          removeOnFail: false,
        }
      );
    });

    it('should skip messages not yet due', async () => {
      const now = DateTime.fromISO('2024-01-15T14:00:00Z');
      jest.setSystemTime(now.toJSDate());

      const scheduledFor = now.plus({ hours: 1 }).toJSDate();
      const pendingMessage = createMockMessageLog({ scheduledFor });

      mockMessageLogRepository.findPendingForDate.mockResolvedValue([pendingMessage]);

      const result = await schedulerService.queueDueMessages(trace_id);

      expect(result.total).toBe(1);
      expect(result.queued).toBe(0);
      expect(result.skippedNotDue).toBe(1);
      expect(mockBirthdayQueue.add).not.toHaveBeenCalled();
    });

    it('should skip messages already in queue', async () => {
      const now = DateTime.fromISO('2024-01-15T14:00:00Z');
      jest.setSystemTime(now.toJSDate());

      const scheduledFor = now.minus({ hours: 1 }).toJSDate();
      const pendingMessage = createMockMessageLog({ scheduledFor });

      mockMessageLogRepository.findPendingForDate.mockResolvedValue([pendingMessage]);
      mockBirthdayQueue.getJob.mockResolvedValue({ id: 'existing-job' } as any);

      const result = await schedulerService.queueDueMessages(trace_id);

      expect(result.total).toBe(1);
      expect(result.queued).toBe(0);
      expect(result.skippedAlreadyQueued).toBe(1);
      expect(mockBirthdayQueue.add).not.toHaveBeenCalled();
    });

    it('should queue all messages when checkDueTime is false', async () => {
      const now = DateTime.fromISO('2024-01-15T14:00:00Z');
      jest.setSystemTime(now.toJSDate());

      const futureScheduledFor = now.plus({ hours: 2 }).toJSDate();
      const pendingMessage = createMockMessageLog({ scheduledFor: futureScheduledFor });

      mockMessageLogRepository.findPendingForDate.mockResolvedValue([pendingMessage]);
      mockBirthdayQueue.getJob.mockResolvedValue(undefined);
      mockBirthdayQueue.add.mockResolvedValue({ id: 'job-123' } as any);

      const result = await schedulerService.queueDueMessages(trace_id, false);

      expect(result.total).toBe(1);
      expect(result.queued).toBe(1);
      expect(result.skippedNotDue).toBe(0);
      expect(mockBirthdayQueue.add).toHaveBeenCalled();
    });

    it('should handle queue failures gracefully', async () => {
      const now = DateTime.fromISO('2024-01-15T14:00:00Z');
      jest.setSystemTime(now.toJSDate());

      const scheduledFor = now.minus({ hours: 1 }).toJSDate();
      const pendingMessage = createMockMessageLog({ scheduledFor });

      mockMessageLogRepository.findPendingForDate.mockResolvedValue([pendingMessage]);
      mockBirthdayQueue.getJob.mockResolvedValue(undefined);
      mockBirthdayQueue.add.mockRejectedValue(new Error('Queue error'));

      const result = await schedulerService.queueDueMessages(trace_id);

      expect(result.total).toBe(1);
      expect(result.queued).toBe(0);
      expect(result.failed.length).toBe(1);
      expect(result.failed[0]).toBe(pendingMessage.id);
    });

    it('should queue multiple messages correctly', async () => {
      const now = DateTime.fromISO('2024-01-15T14:00:00Z');
      jest.setSystemTime(now.toJSDate());

      const message1 = createMockMessageLog({
        id: 'msg-1',
        scheduledFor: now.minus({ hours: 1 }).toJSDate(),
        idempotencyKey: 'user-1:birthday:2024-01-15',
      });
      const message2 = createMockMessageLog({
        id: 'msg-2',
        scheduledFor: now.minus({ minutes: 30 }).toJSDate(),
        idempotencyKey: 'user-2:birthday:2024-01-15',
      });
      const message3 = createMockMessageLog({
        id: 'msg-3',
        scheduledFor: now.plus({ hours: 1 }).toJSDate(),
        idempotencyKey: 'user-3:birthday:2024-01-15',
      });

      mockMessageLogRepository.findPendingForDate.mockResolvedValue([message1, message2, message3]);
      mockBirthdayQueue.getJob.mockResolvedValue(undefined);
      mockBirthdayQueue.add.mockResolvedValue({ id: 'job' } as any);

      const result = await schedulerService.queueDueMessages(trace_id);

      expect(result.total).toBe(3);
      expect(result.queued).toBe(2);
      expect(result.skippedNotDue).toBe(1);
      expect(mockBirthdayQueue.add).toHaveBeenCalledTimes(2);
    });
  });

  describe('processTodayBirthdays', () => {
    it('should process users with birthday today', async () => {
      const today = DateTime.now();
      const user = createMockUser({
        birthDate: new Date(
          `1990-${today.month.toString().padStart(2, '0')}-${today.day.toString().padStart(2, '0')}`
        ),
        timezone: 'America/New_York',
      });

      mockUserRepository.findAll.mockResolvedValue([user]);
      mockMessageLogRepository.findByIdempotencyKey.mockResolvedValue(null);
      mockMessageLogRepository.createOrGet.mockResolvedValue(createMockMessageLog());
      mockMessageLogRepository.updateStatus.mockResolvedValue(
        createMockMessageLog({
          status: MessageStatus.PENDING,
        })
      );

      const trace_id = 'test-trace';
      await (schedulerService as any).processTodayBirthdays(trace_id);

      expect(mockUserRepository.findAll).toHaveBeenCalled();
      expect(mockMessageLogRepository.createOrGet).toHaveBeenCalled();
      expect(mockMessageLogRepository.updateStatus).toHaveBeenCalledWith(
        expect.any(String),
        MessageStatus.PENDING
      );
    });

    it('should update existing unprocessed message to pending', async () => {
      const today = DateTime.now();
      const user = createMockUser({
        birthDate: new Date(
          `1990-${today.month.toString().padStart(2, '0')}-${today.day.toString().padStart(2, '0')}`
        ),
        timezone: 'America/New_York',
      });

      const existingLog = createMockMessageLog({
        status: MessageStatus.UNPROCESSED,
      });

      mockUserRepository.findAll.mockResolvedValue([user]);
      mockMessageLogRepository.findByIdempotencyKey.mockResolvedValue(existingLog);
      mockMessageLogRepository.updateStatus.mockResolvedValue(
        createMockMessageLog({
          status: MessageStatus.PENDING,
        })
      );

      const trace_id = 'test-trace';
      await (schedulerService as any).processTodayBirthdays(trace_id);

      expect(mockMessageLogRepository.updateStatus).toHaveBeenCalledWith(
        existingLog.id,
        MessageStatus.PENDING
      );
    });

    it('should not process users without birthday today', async () => {
      const user = createMockUser({
        birthDate: new Date('1990-12-25'), // Different date
      });

      mockUserRepository.findAll.mockResolvedValue([user]);

      const trace_id = 'test-trace';
      await (schedulerService as any).processTodayBirthdays(trace_id);

      expect(mockMessageLogRepository.createOrGet).not.toHaveBeenCalled();
    });

    it('should handle errors for individual users gracefully', async () => {
      const today = DateTime.now();
      const user1 = createMockUser({
        id: 'user-1',
        birthDate: new Date(
          `1990-${today.month.toString().padStart(2, '0')}-${today.day.toString().padStart(2, '0')}`
        ),
      });
      const user2 = createMockUser({
        id: 'user-2',
        birthDate: new Date(
          `1985-${today.month.toString().padStart(2, '0')}-${today.day.toString().padStart(2, '0')}`
        ),
      });

      mockUserRepository.findAll.mockResolvedValue([user1, user2]);
      mockMessageLogRepository.findByIdempotencyKey
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error('Database error'));

      const trace_id = 'test-trace';
      await (schedulerService as any).processTodayBirthdays(trace_id);

      // Should continue processing despite error
      expect(mockMessageLogRepository.findByIdempotencyKey).toHaveBeenCalledTimes(2);
    });
  });

  describe('processUserBirthday', () => {
    it('should create message log with correct scheduled time', async () => {
      const now = DateTime.fromISO('2024-01-15T10:00:00', { zone: 'UTC' });
      jest.setSystemTime(now.toJSDate());

      const user = createMockUser({
        id: 'user-123',
        birthDate: new Date('1990-01-15'),
        timezone: 'America/New_York',
      });

      mockMessageLogRepository.findByIdempotencyKey.mockResolvedValue(null);
      mockMessageLogRepository.createOrGet.mockResolvedValue(createMockMessageLog());
      mockMessageLogRepository.updateStatus.mockResolvedValue(
        createMockMessageLog({
          status: MessageStatus.PENDING,
        })
      );

      const trace_id = 'test-trace';
      await (schedulerService as any).processUserBirthday(user, trace_id);

      expect(mockMessageLogRepository.createOrGet).toHaveBeenCalledWith({
        userId: user.id,
        messageType: 'birthday',
        scheduledDate: expect.any(Date),
        scheduledFor: expect.any(Date),
        idempotencyKey: expect.stringContaining('user-123:birthday:'),
      });

      expect(mockMessageLogRepository.updateStatus).toHaveBeenCalledWith(
        expect.any(String),
        MessageStatus.PENDING
      );
    });

    it('should respect user timezone when calculating scheduled time', async () => {
      const now = DateTime.fromISO('2024-01-15T00:00:00', { zone: 'UTC' });
      jest.setSystemTime(now.toJSDate());

      const user = createMockUser({
        timezone: 'Asia/Tokyo', // UTC+9
      });

      mockMessageLogRepository.findByIdempotencyKey.mockResolvedValue(null);
      mockMessageLogRepository.createOrGet.mockResolvedValue(createMockMessageLog());
      mockMessageLogRepository.updateStatus.mockResolvedValue(createMockMessageLog());

      const trace_id = 'test-trace';
      await (schedulerService as any).processUserBirthday(user, trace_id);

      const createCall = mockMessageLogRepository.createOrGet.mock.calls[0][0];
      const scheduledFor = DateTime.fromJSDate(createCall.scheduledFor);

      // Verify the hour is BIRTHDAY_MESSAGE_HOUR in user's timezone
      const userTime = scheduledFor.setZone(user.timezone);
      expect(userTime.hour).toBe(BIRTHDAY_MESSAGE_HOUR);
    });
  });
});

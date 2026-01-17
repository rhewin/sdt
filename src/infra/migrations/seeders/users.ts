import 'module-alias/register';
import 'reflect-metadata';
import { config } from 'dotenv';
import { DateTime } from 'luxon';
import { initializeDatabase, closeDatabase } from '@/config/database';
import { logger } from '@/config/logger';
import { notificationEventSubscriber } from '@/infra/notification/notification.events';
import { UserService } from '@/domains/user/user.service';
import { MessageLogRepository } from '@/domains/message-log/message-log.repository';

config();

/**
 * Birthday User Seeder
 * Creates 5 test users with different birthday scenarios:
 * 1. User with birthday already passed this year
 * 2. User with birthday in the future (not yet happened)
 * 3-5. Three users with birthday TODAY in different timezones
 */

async function seedUsers() {
  try {
    await initializeDatabase();
    logger.info('Database initialized for seeder');

    // Register event subscribers (needed for automatic message_log creation)
    notificationEventSubscriber.register();
    logger.info('Event subscribers registered');

    const userService = new UserService();
    const messageLogRepository = new MessageLogRepository();

    const today = DateTime.now();
    const currentYear = today.year;
    const currentMonth = today.month;
    const currentDay = today.day;

    logger.info(
      {
        today: today.toISODate(),
        currentMonth,
        currentDay,
      },
      'Starting user seeder'
    );

    // Clean up existing test users (optional - be careful in production!)
    logger.info(
      'Note: This seeder will create new users. Consider cleaning up old test data first.'
    );

    // ============================================
    // USER 1: Birthday Already Passed This Year
    // ============================================
    const pastBirthday = today.minus({ months: 2 }); // 2 months ago
    const user1 = await userService.createUser({
      firstName: 'Alice',
      lastName: 'Past',
      email: `alice.past.${Date.now()}@example.com`,
      birthDate: `${currentYear - 25}-${pastBirthday.month.toString().padStart(2, '0')}-${pastBirthday.day.toString().padStart(2, '0')}`, // 25 years old, birthday 2 months ago
      timezone: 'America/New_York',
    });

    logger.info(
      {
        userId: user1.id,
        name: user1.getFullName(),
        birthDate: user1.birthDate,
        scenario: 'Birthday already passed this year',
      },
      'Created User 1 - Past Birthday'
    );

    // Check message_log (should be NONE - birthday already passed)
    await new Promise(resolve => setTimeout(resolve, 500)); // Wait for event processing
    const user1Logs = await messageLogRepository.findByIdempotencyKey(
      `${user1.id}:birthday:${today.toFormat('yyyy')}-${pastBirthday.month.toString().padStart(2, '0')}-${pastBirthday.day.toString().padStart(2, '0')}`
    );
    logger.info(
      {
        userId: user1.id,
        messageLogExists: !!user1Logs,
        expected: 'Should be null (birthday passed)',
      },
      'User 1 message_log check'
    );

    // ============================================
    // USER 2: Birthday in the Future
    // ============================================
    const futureBirthday = today.plus({ months: 3 }); // 3 months from now
    const user2 = await userService.createUser({
      firstName: 'Bob',
      lastName: 'Future',
      email: `bob.future.${Date.now()}@example.com`,
      birthDate: `${currentYear - 30}-${futureBirthday.month.toString().padStart(2, '0')}-${futureBirthday.day.toString().padStart(2, '0')}`, // 30 years old, birthday in 3 months
      timezone: 'Europe/London',
    });

    logger.info(
      {
        userId: user2.id,
        name: user2.getFullName(),
        birthDate: user2.birthDate,
        scenario: 'Birthday in the future',
      },
      'Created User 2 - Future Birthday'
    );

    // Check message_log (should exist with status UNPROCESSED)
    await new Promise(resolve => setTimeout(resolve, 500));
    const user2Logs = await messageLogRepository.findByIdempotencyKey(
      `${user2.id}:birthday:${today.toFormat('yyyy')}-${futureBirthday.month.toString().padStart(2, '0')}-${futureBirthday.day.toString().padStart(2, '0')}`
    );
    logger.info(
      {
        userId: user2.id,
        messageLogExists: !!user2Logs,
        status: user2Logs?.status,
        scheduledFor: user2Logs?.scheduledFor,
        expected: 'Should exist with status UNPROCESSED',
      },
      'User 2 message_log check'
    );

    // ============================================
    // USER 3: Birthday TODAY - Asia/Jakarta (UTC+7)
    // ============================================
    const user3 = await userService.createUser({
      firstName: 'Charlie',
      lastName: 'Jakarta',
      email: `charlie.jakarta.${Date.now()}@example.com`,
      birthDate: `${currentYear - 28}-${currentMonth.toString().padStart(2, '0')}-${currentDay.toString().padStart(2, '0')}`, // 28 years old, birthday TODAY
      timezone: 'Asia/Jakarta', // UTC+7
    });

    logger.info(
      {
        userId: user3.id,
        name: user3.getFullName(),
        birthDate: user3.birthDate,
        timezone: 'Asia/Jakarta (UTC+7)',
        scenario: 'Birthday TODAY',
      },
      'Created User 3 - Birthday Today (Jakarta)'
    );

    await new Promise(resolve => setTimeout(resolve, 500));
    const user3Logs = await messageLogRepository.findByIdempotencyKey(
      `${user3.id}:birthday:${today.toFormat('yyyy-MM-dd')}`
    );
    const scheduledForJakarta = user3Logs?.scheduledFor
      ? DateTime.fromJSDate(user3Logs.scheduledFor).setZone('Asia/Jakarta').toISO()
      : null;
    logger.info(
      {
        userId: user3.id,
        messageLogExists: !!user3Logs,
        status: user3Logs?.status,
        scheduledFor: user3Logs?.scheduledFor,
        scheduledForJakarta,
        expected:
          'Should exist with status PENDING (if before 7 PM Jakarta) or PENDING with error (if after 7 PM Jakarta)',
      },
      'User 3 message_log check'
    );

    // ============================================
    // USER 4: Birthday TODAY - Asia/Dhaka (UTC+6)
    // ============================================
    const user4 = await userService.createUser({
      firstName: 'Diana',
      lastName: 'Dhaka',
      email: `diana.dhaka.${Date.now()}@example.com`,
      birthDate: `${currentYear - 32}-${currentMonth.toString().padStart(2, '0')}-${currentDay.toString().padStart(2, '0')}`, // 32 years old, birthday TODAY
      timezone: 'Asia/Dhaka', // UTC+6
    });

    logger.info(
      {
        userId: user4.id,
        name: user4.getFullName(),
        birthDate: user4.birthDate,
        timezone: 'Asia/Dhaka (UTC+6)',
        scenario: 'Birthday TODAY',
      },
      'Created User 4 - Birthday Today (Dhaka)'
    );

    await new Promise(resolve => setTimeout(resolve, 500));
    const user4Logs = await messageLogRepository.findByIdempotencyKey(
      `${user4.id}:birthday:${today.toFormat('yyyy-MM-dd')}`
    );
    const scheduledForDhaka = user4Logs?.scheduledFor
      ? DateTime.fromJSDate(user4Logs.scheduledFor).setZone('Asia/Dhaka').toISO()
      : null;
    logger.info(
      {
        userId: user4.id,
        messageLogExists: !!user4Logs,
        status: user4Logs?.status,
        scheduledFor: user4Logs?.scheduledFor,
        scheduledForDhaka,
        expected:
          'Should exist with status PENDING (if before 7 PM Dhaka) or PENDING with error (if after 7 PM Dhaka)',
      },
      'User 4 message_log check'
    );

    // ============================================
    // USER 5: Birthday TODAY - Asia/Singapore (UTC+8)
    // ============================================
    const user5 = await userService.createUser({
      firstName: 'Eve',
      lastName: 'Singapore',
      email: `eve.singapore.${Date.now()}@example.com`,
      birthDate: `${currentYear - 27}-${currentMonth.toString().padStart(2, '0')}-${currentDay.toString().padStart(2, '0')}`, // 27 years old, birthday TODAY
      timezone: 'Asia/Singapore', // UTC+8
    });

    logger.info(
      {
        userId: user5.id,
        name: user5.getFullName(),
        birthDate: user5.birthDate,
        timezone: 'Asia/Singapore (UTC+8)',
        scenario: 'Birthday TODAY',
      },
      'Created User 5 - Birthday Today (Singapore)'
    );

    await new Promise(resolve => setTimeout(resolve, 500));
    const user5Logs = await messageLogRepository.findByIdempotencyKey(
      `${user5.id}:birthday:${today.toFormat('yyyy-MM-dd')}`
    );
    const scheduledForSingapore = user5Logs?.scheduledFor
      ? DateTime.fromJSDate(user5Logs.scheduledFor).setZone('Asia/Singapore').toISO()
      : null;
    logger.info(
      {
        userId: user5.id,
        messageLogExists: !!user5Logs,
        status: user5Logs?.status,
        scheduledFor: user5Logs?.scheduledFor,
        scheduledForSingapore,
        expected:
          'Should exist with status PENDING (if before 7 PM Singapore) or PENDING with error (if after 7 PM Singapore)',
      },
      'User 5 message_log check'
    );

    // ============================================
    // Summary
    // ============================================
    logger.info('='.repeat(80));
    logger.info('Seeder completed successfully!');
    logger.info('='.repeat(80));
    logger.info('Created 5 users with different birthday scenarios:');
    logger.info(
      `1. ${user1.getFullName()} - Birthday already passed (${pastBirthday.toFormat('MMM dd')})`
    );
    logger.info(
      `2. ${user2.getFullName()} - Birthday in future (${futureBirthday.toFormat('MMM dd')})`
    );
    logger.info(`3. ${user3.getFullName()} - Birthday TODAY (Asia/Jakarta, UTC+7)`);
    logger.info(`4. ${user4.getFullName()} - Birthday TODAY (Asia/Dhaka, UTC+6)`);
    logger.info(`5. ${user5.getFullName()} - Birthday TODAY (Asia/Singapore, UTC+8)`);
    logger.info('='.repeat(80));
    logger.info('Message logs created automatically via event system');
    logger.info('Check the database to verify message_logs table');
    logger.info('='.repeat(80));
  } catch (error) {
    logger.error(
      {
        error: (error as Error).message,
        stack: (error as Error).stack,
      },
      'Seeder failed'
    );
    throw error;
  } finally {
    await closeDatabase();
    logger.info('Database connection closed');
    process.exit(0);
  }
}

// Run seeder
seedUsers();

import { MigrationInterface, QueryRunner, Table, TableForeignKey, Index } from 'typeorm';

export class CreateMessageLogsTable1705300100000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum type for message status
    await queryRunner.query(`
      CREATE TYPE message_status AS ENUM (
        'pending',
        'processing',
        'sent',
        'failed',
        'retrying'
      );
    `);

    await queryRunner.createTable(
      new Table({
        name: 'message_logs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'message_type',
            type: 'varchar',
            length: '50',
            default: "'birthday'",
            isNullable: false,
            comment: 'Type of message (birthday, anniversary, etc.)',
          },
          {
            name: 'scheduled_date',
            type: 'date',
            isNullable: false,
            comment: 'The date the message is scheduled for',
          },
          {
            name: 'scheduled_for',
            type: 'timestamp with time zone',
            isNullable: false,
            comment: 'Exact UTC timestamp when message should be sent (9 AM local time)',
          },
          {
            name: 'idempotency_key',
            type: 'varchar',
            length: '255',
            isNullable: false,
            isUnique: true,
            comment: 'Format: {userId}:{messageType}:{date} - prevents duplicate messages',
          },
          {
            name: 'status',
            type: 'message_status',
            default: "'pending'",
            isNullable: false,
          },
          {
            name: 'attempt_count',
            type: 'integer',
            default: 0,
            isNullable: false,
          },
          {
            name: 'last_attempt_at',
            type: 'timestamp with time zone',
            isNullable: true,
          },
          {
            name: 'sent_at',
            type: 'timestamp with time zone',
            isNullable: true,
          },
          {
            name: 'error_message',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp with time zone',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamp with time zone',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
      true
    );

    // Create foreign key
    await queryRunner.createForeignKey(
      'message_logs',
      new TableForeignKey({
        name: 'FK_MESSAGE_LOGS_USER',
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      })
    );

    // Create indexes
    await queryRunner.createIndex(
      'message_logs',
      new Index({
        name: 'IDX_MESSAGE_LOGS_IDEMPOTENCY',
        columnNames: ['idempotency_key'],
        isUnique: true,
      })
    );

    await queryRunner.createIndex(
      'message_logs',
      new Index({
        name: 'IDX_MESSAGE_LOGS_STATUS_SCHEDULED',
        columnNames: ['status', 'scheduled_for'],
      })
    );

    await queryRunner.createIndex(
      'message_logs',
      new Index({
        name: 'IDX_MESSAGE_LOGS_USER_DATE',
        columnNames: ['user_id', 'scheduled_date', 'message_type'],
      })
    );

    await queryRunner.createIndex(
      'message_logs',
      new Index({
        name: 'IDX_MESSAGE_LOGS_RECOVERY',
        columnNames: ['status', 'scheduled_for'],
        where: "status IN ('pending', 'failed', 'retrying')",
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('message_logs');
    await queryRunner.query('DROP TYPE message_status;');
  }
}

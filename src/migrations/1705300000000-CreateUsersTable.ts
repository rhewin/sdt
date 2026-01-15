import { MigrationInterface, QueryRunner, Table, Index } from 'typeorm';

export class CreateUsersTable1705300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'users',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'first_name',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'last_name',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'email',
            type: 'varchar',
            length: '255',
            isNullable: false,
            isUnique: true,
          },
          {
            name: 'birth_date',
            type: 'date',
            isNullable: false,
          },
          {
            name: 'timezone',
            type: 'varchar',
            length: '50',
            isNullable: false,
            comment: 'IANA timezone (e.g., America/New_York)',
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
          {
            name: 'deleted_at',
            type: 'timestamp with time zone',
            isNullable: true,
          },
        ],
      }),
      true
    );

    // Create indexes
    await queryRunner.createIndex(
      'users',
      new Index({
        name: 'IDX_USERS_EMAIL',
        columnNames: ['email'],
      })
    );

    await queryRunner.createIndex(
      'users',
      new Index({
        name: 'IDX_USERS_BIRTH_DATE',
        columnNames: ['birth_date'],
        where: 'deleted_at IS NULL',
      })
    );

    await queryRunner.createIndex(
      'users',
      new Index({
        name: 'IDX_USERS_DELETED_AT',
        columnNames: ['deleted_at'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('users');
  }
}

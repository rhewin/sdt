import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { logger } from './logger';

config();

// Import entities AFTER reflect-metadata and dotenv config
import { User } from '@/domains/user/user.model';
import { MessageLog } from '@/domains/message-log/message-log.model';

const isProduction = process.env.NODE_ENV === 'production';
const ext = isProduction ? 'js' : 'ts';
const dir = isProduction ? 'dist' : 'src';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  username: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || 'sdt',
  synchronize: false, // Always use migrations in production
  logging: process.env.NODE_ENV === 'development',
  entities: [User, MessageLog, `${dir}/domains/**/*.model.{${ext}}`],
  migrations: [`${dir}/infra/migrations/*-*.${ext}`], // Only load migration files (exclude seeders)
  subscribers: [],
  extra: {
    max: parseInt(process.env.DATABASE_POOL_MAX || '10'),
    min: parseInt(process.env.DATABASE_POOL_MIN || '2'),
  },
});

export const initializeDatabase = async (): Promise<void> => {
  try {
    await AppDataSource.initialize();

    // Log registered entities for debugging
    const entities = AppDataSource.entityMetadatas.map(e => e.name);
    logger.info({ entities }, 'Database connection established successfully');
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Error connecting to database');
    throw error;
  }
};

export const closeDatabase = async (): Promise<void> => {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
    logger.info('Database connection closed');
  }
};

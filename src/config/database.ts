import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { logger } from './logger';

config();

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
  entities: [`${dir}/domains/**/*.model.${ext}`],
  migrations: [`${dir}/infra/migrations/**/*.${ext}`],
  subscribers: [],
  extra: {
    max: parseInt(process.env.DATABASE_POOL_MAX || '10'),
    min: parseInt(process.env.DATABASE_POOL_MIN || '2'),
  },
});

export const initializeDatabase = async (): Promise<void> => {
  try {
    await AppDataSource.initialize();
    logger.info('Database connection established successfully');
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Error connecting to database');
    throw error;
  }
}

export const closeDatabase = async (): Promise<void> => {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
    logger.info('Database connection closed');
  }
}

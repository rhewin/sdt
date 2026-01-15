import { DataSource } from 'typeorm';
import { config } from 'dotenv';

config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  username: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || 'birthday_system',
  synchronize: false, // Always use migrations in production
  logging: process.env.NODE_ENV === 'development',
  entities: ['src/models/**/*.ts'],
  migrations: ['src/migrations/**/*.ts'],
  subscribers: [],
  extra: {
    max: parseInt(process.env.DATABASE_POOL_MAX || '10'),
    min: parseInt(process.env.DATABASE_POOL_MIN || '2'),
  },
});

// Initialize connection
export async function initializeDatabase(): Promise<void> {
  try {
    await AppDataSource.initialize();
    console.log('Database connection established successfully');
  } catch (error) {
    console.error('Error connecting to database:', error);
    throw error;
  }
}

// Close connection
export async function closeDatabase(): Promise<void> {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
    console.log('Database connection closed');
  }
}

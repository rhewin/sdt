import 'reflect-metadata';
import 'module-alias/register';
import { AppDataSource } from '@/config/database';
import { logger } from '@/config/logger';

async function runMigrations() {
  try {
    logger.info('Initializing database connection...');
    await AppDataSource.initialize();

    logger.info('Running migrations...');
    const migrations = await AppDataSource.runMigrations();

    if (migrations.length === 0) {
      logger.info('No new migrations to run');
    } else {
      logger.info(`Successfully ran ${migrations.length} migration(s):`);
      migrations.forEach(migration => {
        logger.info(`  - ${migration.name}`);
      });
    }

    await AppDataSource.destroy();
    logger.info('Migration completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error(
      { error: (error as Error).message, stack: (error as Error).stack },
      'Migration failed'
    );
    process.exit(1);
  }
}

runMigrations();

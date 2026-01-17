import { Request, Response } from 'express';
import { AppDataSource } from '@/config/database';
import { jsonOk } from '@/shared/output';


export const healthController = async (_: Request, res: Response): Promise<void> => {
  const healthCheck = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: AppDataSource.isInitialized ? 'connected' : 'disconnected'
  };

  jsonOk(res, 'System healthy', 200, healthCheck);
}

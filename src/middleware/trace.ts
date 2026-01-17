import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { createLoggerWithTrace } from '@/config/logger';

// Extend Express Request type to include trace_id
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      trace_id: string;
      log: ReturnType<typeof createLoggerWithTrace>;
    }
  }
}

export const traceMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Generate unique trace ID for this request
  req.trace_id = randomUUID();

  // Create child logger with trace_id
  req.log = createLoggerWithTrace(req.trace_id);

  // Add trace_id to response headers for debugging
  res.setHeader('X-Trace-Id', req.trace_id);

  next();
};

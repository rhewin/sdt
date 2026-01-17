import { Request, Response, NextFunction } from 'express';
import { logError } from '@/config/logger';
import { ApiResponse } from '@/shared/types';

export function errorHandler(error: Error, req: Request, res: Response, _next: NextFunction): void {
  const trace_id = req.trace_id || 'unknown';

  // Log the error
  logError(trace_id, error, {
    path: req.path,
    method: req.method,
    body: req.body,
  });

  // Prepare error response
  const response: ApiResponse = {
    success: false,
    error: error.message || 'An unexpected error occurred',
    trace_id,
  };

  // Determine status code
  let statusCode = 500;
  if (error.message.includes('not found')) {
    statusCode = 404;
  } else if (error.message.includes('already exists') || error.message.includes('duplicate')) {
    statusCode = 409;
  } else if (error.message.includes('Invalid') || error.message.includes('validation')) {
    statusCode = 400;
  }

  res.status(statusCode).json(response);
}

// 404 handler for undefined routes
export function notFoundHandler(req: Request, res: Response): void {
  const trace_id = req.trace_id || 'unknown';

  const response: ApiResponse = {
    success: false,
    error: `Route ${req.method} ${req.path} not found`,
    trace_id,
  };

  res.status(404).json(response);
}

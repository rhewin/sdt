import pino from 'pino';
import { config } from 'dotenv';

config();

const isDevelopment = process.env.NODE_ENV === 'development';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: label => {
      return { level: label };
    },
  },
  base: {
    pid: process.pid,
    environment: process.env.NODE_ENV || 'development',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});

// Create child logger with trace_id
export const createLoggerWithTrace = (trace_id: string) => {
  return logger.child({ trace_id });
};

// Log only errors
export function logError(trace_id: string, error: Error, context?: Record<string, unknown>) {
  logger.error(
    {
      trace_id,
      error: error.message,
      stack: error.stack,
      ...context,
    },
    'Error occurred'
  );
}

// Log external HTTP requests
export function logExternalRequest(trace_id: string, method: string, url: string, body?: unknown) {
  logger.info(
    {
      trace_id,
      method,
      url,
      body,
      type: 'external_http_request',
    },
    'External API request'
  );
}

// Log external HTTP responses
export function logExternalResponse(
  trace_id: string,
  method: string,
  url: string,
  status: number,
  duration: number,
  body?: unknown
) {
  logger.info(
    {
      trace_id,
      method,
      url,
      status,
      duration,
      body,
      type: 'external_http_response',
    },
    'External API response'
  );
}

// Log critical operations
export function logCriticalOperation(
  trace_id: string,
  operation: string,
  data?: Record<string, unknown>
) {
  logger.info(
    {
      trace_id,
      operation,
      ...data,
      type: 'critical_operation',
    },
    `Critical operation: ${operation}`
  );
}

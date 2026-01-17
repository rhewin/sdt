import CircuitBreaker from 'opossum';
import { config } from 'dotenv';
import { logExternalRequest, logExternalResponse, logError, logger } from '@/config/logger';
import { User } from '@/domains/user/user.model';

config();

interface EmailRequest {
  email: string;
  message: string;
}

interface EmailResponse {
  success: boolean;
  message?: string;
}

export class EmailService {
  private circuitBreaker: CircuitBreaker<[EmailRequest, string], EmailResponse>;
  private apiUrl: string;
  private timeout: number;

  constructor() {
    this.apiUrl =
      process.env.EMAIL_API_URL || 'https://email-service.digitalenvision.com.au/send-email';
    this.timeout = parseInt(process.env.EMAIL_API_TIMEOUT || '10000');

    // Create circuit breaker to prevent cascading failures
    this.circuitBreaker = new CircuitBreaker(
      async (emailRequest: EmailRequest, trace_id: string) => {
        return await this.sendEmailRequest(emailRequest, trace_id);
      },
      {
        timeout: this.timeout,
        errorThresholdPercentage: 50, // Open circuit if 50% of requests fail
        resetTimeout: 30000, // Try again after 30 seconds
      }
    );

    // Circuit breaker events
    this.circuitBreaker.on('open', () => {
      logger.error(
        { service: 'EmailService' },
        'Circuit breaker opened - email service unavailable'
      );
    });

    this.circuitBreaker.on('halfOpen', () => {
      logger.info({ service: 'EmailService' }, 'Circuit breaker half-open - testing email service');
    });

    this.circuitBreaker.on('close', () => {
      logger.info({ service: 'EmailService' }, 'Circuit breaker closed - email service recovered');
    });

    // Fallback when circuit is open
    this.circuitBreaker.fallback(() => {
      throw new Error('Email service temporarily unavailable - circuit breaker open');
    });
  }

  sendBirthdayMessage = async (
    user: User,
    trace_id: string = 'unknown'
  ): Promise<EmailResponse> => {
    const message = `Hey, ${user.getFullName()} it's your birthday`;

    const emailRequest: EmailRequest = {
      email: user.email,
      message,
    };

    return await this.circuitBreaker.fire(emailRequest, trace_id);
  };

  private sendEmailRequest = async (
    emailRequest: EmailRequest,
    trace_id: string
  ): Promise<EmailResponse> => {
    const startTime = Date.now();

    // Log request
    logExternalRequest(trace_id, 'POST', this.apiUrl, emailRequest);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await fetch(this.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(emailRequest),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const duration = Date.now() - startTime;
        const responseBody = await response.text();

        // Log response
        logExternalResponse(
          trace_id,
          'POST',
          this.apiUrl,
          response.status,
          duration,
          responseBody ? JSON.parse(responseBody) : undefined
        );

        if (!response.ok) {
          // 400 errors are client errors - don't retry
          if (response.status >= 400 && response.status < 500) {
            const error = new Error(
              `Email API client error ${response.status}: ${responseBody}`
            ) as Error & { statusCode?: number; shouldRetry?: boolean };
            error.statusCode = response.status;
            error.shouldRetry = false; // Mark as permanent failure
            throw error;
          }

          // 500 errors are server errors - should retry
          if (response.status >= 500) {
            const error = new Error(
              `Email API server error ${response.status}: ${responseBody}`
            ) as Error & { statusCode?: number; shouldRetry?: boolean };
            error.statusCode = response.status;
            error.shouldRetry = true; // Will be retried by BullMQ
            throw error;
          }

          // Other errors
          throw new Error(`Email API returned status ${response.status}: ${responseBody}`);
        }

        return {
          success: true,
          message: 'Email sent successfully',
        };
      } catch (error) {
        clearTimeout(timeoutId);

        if ((error as Error).name === 'AbortError') {
          const timeoutError = new Error(
            `Email API request timed out after ${this.timeout}ms`
          ) as Error & { shouldRetry?: boolean };
          timeoutError.shouldRetry = true; // Timeouts should be retried
          throw timeoutError;
        }

        throw error;
      }
    } catch (error) {
      const duration = Date.now() - startTime;

      logExternalResponse(trace_id, 'POST', this.apiUrl, 0, duration, {
        error: (error as Error).message,
      });

      logError(trace_id, error as Error, {
        service: 'EmailService',
        url: this.apiUrl,
      });

      throw error;
    }
  };

  // Get circuit breaker stats for monitoring
  getStats() {
    return {
      status: this.circuitBreaker.status,
      stats: this.circuitBreaker.stats,
    };
  }
}

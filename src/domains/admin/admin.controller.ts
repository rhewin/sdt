import { Request, Response } from 'express';
import { HourlySchedulerService } from '@/infra/scheduling/scheduler.service';
import { logger } from '@/config/logger';
import { jsonOk, jsonError } from '@/shared/output';

export class AdminController {
  private schedulerService: HourlySchedulerService;

  constructor() {
    this.schedulerService = new HourlySchedulerService();
  }

  /**
   * Manual trigger to send pending birthday messages for today
   * POST /manual/send-birthday-
   * Forces immediate queuing regardless of scheduled time
   */
  sendPendingMessages = async (req: Request, res: Response): Promise<void> => {
    const trace_id = req.trace_id || `manual-trigger-${Date.now()}`;

    try {
      logger.info({ trace_id }, 'Manual trigger: Sending pending birthday messages');

      // Use scheduler service with checkDueTime=false to skip time check
      const result = await this.schedulerService.queueDueMessages(trace_id, false);
      logger.info({ result }, 'queueDueMessages: ');

      if (result.total === 0) {
        jsonOk(res, 'No pending messages found for today', 200, { count: 0 });
        return;
      }

      jsonOk(res, 'Pending messages processed', 200, {
        total: result.total,
        queued: result.queued,
        skipped: result.skippedAlreadyQueued,
        skippedNotDue: result.skippedNotDue,
        failed: result.failed.length,
        failedIds: result.failed,
      });
    } catch (error) {
      logger.error(
        {
          trace_id,
          error: (error as Error).message,
          stack: (error as Error).stack,
        },
        'Manual trigger failed'
      );

      jsonError(res, 'Failed to process pending messages', 500);
    }
  };
}

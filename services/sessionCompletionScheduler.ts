import cron from 'node-cron';
import logger from '../utils/logger';
import { completeOverdueSessions } from './sessionCompletionService';
import { settleDueBookings } from './bookingSettlementService';

let scheduledJob: cron.ScheduledTask | null = null;

export const startSessionCompletionScheduler = () => {
  if (scheduledJob) {
    logger.warn('Session completion scheduler already running');
    return;
  }

  scheduledJob = cron.schedule('*/30 * * * *', async () => {
    try {
      const completed = await completeOverdueSessions();
      if (completed.length > 0) {
        logger.info({ completedCount: completed.length }, 'session.completion_scheduler_completed');
      }
    } catch (err) {
      logger.error({ err }, 'session.completion_scheduler_failed');
    }
    // Phase 2 (cron-only by design): release escrow for completed bookings
    // past the 1-hour dispute window. Never throws — per-booking isolation.
    try {
      const summary = await settleDueBookings();
      if (summary.candidates > 0) {
        logger.info(summary, 'session.settlement_scheduler_completed');
      }
    } catch (err) {
      logger.error({ err }, 'session.settlement_scheduler_failed');
    }
  });

  logger.info('Session completion scheduler started (every 30 minutes)');
};

export const stopSessionCompletionScheduler = () => {
  if (scheduledJob) {
    scheduledJob.stop();
    scheduledJob = null;
    logger.info('Session completion scheduler stopped');
  }
};

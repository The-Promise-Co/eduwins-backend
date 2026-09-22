import cron from 'node-cron';
import { cancelExpiredAcceptedBookings } from './bookingExpiryService';
import logger from '../utils/logger';

let scheduledJob: cron.ScheduledTask | null = null;

export const startBookingExpiryScheduler = () => {
  if (scheduledJob) {
    logger.warn('Booking expiry scheduler already running');
    return;
  }

  scheduledJob = cron.schedule('*/5 * * * *', async () => {
    try {
      logger.debug('Running booking expiry check');
      const cancelled = await cancelExpiredAcceptedBookings();
      if (cancelled.length > 0) {
        logger.info({ cancelledCount: cancelled.length }, 'booking.expiry_scheduler_cancelled');
      }
    } catch (err) {
      logger.error({ err }, 'booking.expiry_scheduler_failed');
    }
  });

  logger.info('Booking expiry scheduler started (every 5 minutes)');
};

export const stopBookingExpiryScheduler = () => {
  if (scheduledJob) {
    scheduledJob.stop();
    scheduledJob = null;
    logger.info('Booking expiry scheduler stopped');
  }
};
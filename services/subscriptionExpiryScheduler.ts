import cron from 'node-cron';
import { expireAllStaleSubscriptions, sendDueRenewalReminders } from './subscriptionService';
import logger from '../utils/logger';

let expiryJob: cron.ScheduledTask | null = null;
let reminderJob: cron.ScheduledTask | null = null;

export const startSubscriptionScheduler = () => {
  if (expiryJob || reminderJob) {
    logger.warn('Subscription scheduler already running');
    return;
  }

  // Expiry sweep — ended terms flip to expired, search rank resets, tutors
  // get one end-of-term notification. Same work the lazy per-tutor sweep
  // does, but for all tutors so ghosted accounts can't keep premium rank.
  expiryJob = cron.schedule('*/5 * * * *', async () => {
    try {
      const expired = await expireAllStaleSubscriptions();
      if (expired > 0) {
        logger.info({ expiredCount: expired }, 'subscription.expiry_scheduler_sweep');
      }
    } catch (err) {
      logger.error({ err }, 'subscription.expiry_scheduler_failed');
    }
  });

  // Renewal reminders — active terms ending within 7 days notify once.
  // Runs hourly; the reminder flag makes overlaps harmless.
  reminderJob = cron.schedule('15 * * * *', async () => {
    try {
      const sent = await sendDueRenewalReminders();
      if (sent > 0) {
        logger.info({ remindersSent: sent }, 'subscription.reminder_scheduler_run');
      }
    } catch (err) {
      logger.error({ err }, 'subscription.reminder_scheduler_failed');
    }
  });

  logger.info('Subscription scheduler started (expiry every 5 min, reminders hourly)');
};

export const stopSubscriptionScheduler = () => {
  if (expiryJob) {
    expiryJob.stop();
    expiryJob = null;
  }
  if (reminderJob) {
    reminderJob.stop();
    reminderJob = null;
  }
  logger.info('Subscription scheduler stopped');
};

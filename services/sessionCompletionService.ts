import { and, eq, sql } from 'drizzle-orm';
import { db } from '../database/db';
import { bookings } from '../database/schema';
import logger from '../utils/logger';

const SESSION_GRACE_PERIOD_MINUTES = 30;

/**
 * Completes paid sessions that were not explicitly ended after their scheduled
 * end time. The comparison runs in PostgreSQL so the booking's date and time
 * are evaluated together using the database timezone.
 */
export const completeOverdueSessions = async () => {
  const now = new Date();
  const completedBookings = await db.update(bookings)
    .set({
      status: 'completed',
      sessionEndedAt: now,
      updatedAt: now,
    })
    .where(and(
      eq(bookings.status, 'paid_escrow'),
      sql`(${bookings.scheduledDate}::timestamp + ${bookings.endTime}::time) <= now() - make_interval(mins => ${SESSION_GRACE_PERIOD_MINUTES})`,
    ))
    .returning();

  if (completedBookings.length > 0) {
    logger.info({ count: completedBookings.length }, 'session.overdue_completed_batch');
  }

  return completedBookings;
};

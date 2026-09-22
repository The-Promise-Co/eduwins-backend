import { and, eq, isNull, isNotNull, lte } from 'drizzle-orm';
import { db } from '../database/db';
import { bookings } from '../database/schema';
import { createNotification } from '../controllers/notificationController';
import logger from '../utils/logger';
import { getBookingPaymentWindowHours } from './systemSettingsService';

export const cancelExpiredAcceptedBookings = async () => {
  const paymentWindowHours = await getBookingPaymentWindowHours();
  const cutoff = new Date(Date.now() - paymentWindowHours * 60 * 60 * 1000);

  const expiredBookings = await db.update(bookings)
    .set({
      status: 'cancelled',
      cancelledAt: new Date(),
      cancelledBy: 'system',
      updatedAt: new Date(),
    })
    .where(and(
      eq(bookings.status, 'accepted'),
      isNull(bookings.paidAt),
      isNotNull(bookings.acceptedAt),
      lte(bookings.acceptedAt, cutoff)
    ))
    .returning();

  if (expiredBookings.length > 0) {
    logger.info({ count: expiredBookings.length, cutoff: cutoff.toISOString() }, 'booking.expired_cancelled_batch');

    for (const booking of expiredBookings) {
      if (booking.parentId) {
        await createNotification({
          userId: booking.parentId,
          type: 'booking_auto_cancelled',
          title: 'Booking auto-cancelled',
          message: `Your booking for ${booking.scheduledDate || ''} ${booking.startTime || ''}-${booking.endTime || ''} was cancelled because payment was not completed within ${paymentWindowHours} hour${paymentWindowHours === 1 ? '' : 's'}.`,
        });
      }

      if (booking.teacherId) {
        await createNotification({
          userId: booking.teacherId,
          type: 'booking_auto_cancelled',
          title: 'Booking auto-cancelled',
          message: `Booking for ${booking.scheduledDate || ''} ${booking.startTime || ''}-${booking.endTime || ''} was cancelled because parent payment was not received within ${paymentWindowHours} hour${paymentWindowHours === 1 ? '' : 's'}.`,
        });
      }
    }
  }

  return expiredBookings;
};
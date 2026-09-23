import { Request, Response } from 'express';
import crypto from 'crypto';
import { and, eq, isNull, isNotNull, lte } from 'drizzle-orm';
import { db } from '../../database/db';
import { transactions, bookings } from '../../database/schema';
import { enrollUserInCourse } from '../courses/enrollment';
import { settleCoursePayment } from './verifyPayment';
import logger from '../../utils/logger';
import { getBookingPaymentWindowHours } from '../../services/systemSettingsService';
import { createNotification } from '../notificationController';

export const paystackWebhook = async (req: Request, res: Response) => {
  const hash = req.headers['x-paystack-signature'] as string;
  const secret = process.env.PAYSTACK_SECRET_KEY;
  const log = req.log || logger;

  if (!secret) return res.status(500).json({ error: 'Paystack not configured' });

  const body = JSON.stringify(req.body);
  const expectedHash = crypto.createHmac('sha512', secret).update(body).digest('hex');

  if (expectedHash !== hash) {
    log.warn({ provider: 'paystack' }, 'payment.webhook_invalid_signature');
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  const event = req.body;

  log.info({
    provider: 'paystack',
    event: event.event,
    reference: event.data?.reference,
  }, 'payment.webhook_received');

  if (event.event === 'charge.success') {
    try {
      const metadata = event.data.metadata || {};

      if (metadata.booking_id) {
        const bookingId = metadata.booking_id;
        const teacherId = metadata.teacher_id;
        const parentId = metadata.parent_id;
        const paystackReference = event.data.reference;

        if (!bookingId || !teacherId || !parentId) {
          log.warn({ metadata, reference: paystackReference }, 'payment.webhook_booking_missing_ids');
        } else {
          const existingTransaction = await db.query.transactions.findFirst({
            where: eq(transactions.paystackReference, paystackReference),
          });

          if (existingTransaction) {
            log.info({
              reference: paystackReference,
              transactionId: existingTransaction.id,
              bookingId,
              teacherId,
              parentId,
            }, 'payment.webhook_booking_skipped_existing_transaction');
          } else {
            const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId) });
            if (!booking) {
              log.warn({ bookingId, reference: paystackReference }, 'payment.webhook_booking_not_found');
            } else if (booking.status !== 'accepted') {
              log.warn({ bookingId, status: booking.status, reference: paystackReference }, 'payment.webhook_booking_not_accepted');
            } else if (booking.paidAt) {
              log.warn({ bookingId, reference: paystackReference }, 'payment.webhook_booking_already_paid');
            } else if (!booking.acceptedAt) {
              log.warn({ bookingId, reference: paystackReference }, 'payment.webhook_booking_missing_accepted_at');
            } else {
              const paymentWindowHours = await getBookingPaymentWindowHours();
              const acceptedTime = new Date(booking.acceptedAt).getTime();
              if (!Number.isFinite(acceptedTime) || acceptedTime + paymentWindowHours * 60 * 60 * 1000 < Date.now()) {
                await db.update(bookings)
                  .set({ status: 'cancelled', cancelledAt: new Date(), cancelledBy: 'system', updatedAt: new Date() })
                  .where(eq(bookings.id, bookingId));
                log.warn({ bookingId, reference: paystackReference }, 'payment.webhook_booking_expired_cancelled');
              } else {
                // Pass-fees adds the fee at checkout: escrow = customer
                // total − Paystack's returned fee (= cost we initialized).
                // The fee is recorded, never folded into the value.
                const chargedAmount = Number(event.data.amount || 0) / 100;
                const paystackFee = Number(event.data.fees || 0) / 100;
                const escrowAmount = chargedAmount - paystackFee;
                if (!Number.isFinite(escrowAmount) || escrowAmount <= 0) {
                  log.warn({ bookingId, chargedAmount, paystackFee, reference: paystackReference }, 'payment.webhook_booking_amount_mismatch');
                } else {
                  const transactionId = Math.random().toString(36).substring(2, 15);
                  await db.insert(transactions).values({
                    id: transactionId,
                    bookingId,
                    teacherId,
                    paystackReference: paystackReference || null,
                    amount: escrowAmount.toString(),
                    type: 'booking_escrow_payment',
                    metadata: {
                      ...event.data,
                      parentId,
                      escrowAmount,
                      chargedAmount,
                      paystackFee,
                      feeBearer: 'customer',
                    },
                  });

                  const now = new Date();
                  const [updated] = await db.update(bookings)
                    .set({
                      status: 'paid_escrow',
                      paidAt: now,
                      paymentReference: paystackReference,
                      updatedAt: now,
                    })
                    .where(eq(bookings.id, bookingId))
                    .returning();

                  if (updated) {
                    await createNotification({
                      userId: parentId,
                      type: 'booking_payment_confirmed',
                      title: 'Payment confirmed',
                      message: `Your payment of ₦${chargedAmount.toLocaleString()} (incl. ₦${paystackFee.toLocaleString()} processing fee) was confirmed. Session secured.`,
                    });

                    await createNotification({
                      userId: teacherId,
                      type: 'booking_paid_escrow',
                      title: 'Payment received',
                      message: `Parent payment of ₦${escrowAmount.toLocaleString()} received and held in platform escrow.`,
                    });

                    log.info({
                      reference: paystackReference,
                      transactionId,
                      bookingId,
                      teacherId,
                      parentId,
                      escrowAmount,
                      chargedAmount,
                      paystackFee,
                    }, 'payment.webhook_booking_settlement_succeeded');
                  }
                }
              }
            }
          }
        }
      }

      // A booking charge is fully handled above (settled, skipped as a
      // duplicate, or rejected with a warning). Exit here so the generic
      // payment_in recorder below can never write a duplicate row for it —
      // including on webhook retries, where the booking branch dedupes but
      // the generic insert has no guard.
      if (metadata.booking_id) {
        return res.json({ received: true });
      }

      if (metadata.course_id && metadata.user_id) {
        const enrollmentResult = await enrollUserInCourse(metadata.course_id, metadata.user_id);
        await settleCoursePayment({
          metadata,
          paymentData: event.data,
          enrollmentResult,
          log,
        });

        return res.json({ received: true });
      }

      const transactionId = Math.random().toString(36).substring(2, 15);
      await db.insert(transactions).values({
        id: transactionId,
        bookingId: metadata.booking_id || null,
        teacherId: metadata.teacher_id || null,
        paystackReference: event.data.reference || null,
        amount: (event.data.amount / 100).toString(),
        type: 'payment_in',
        metadata: event.data,
      });

      log.info({
        transactionId,
        bookingId: metadata.booking_id,
        teacherId: metadata.teacher_id,
        reference: event.data.reference,
        amount: event.data.amount / 100,
        provider: 'paystack',
      }, 'payment.webhook_transaction_recorded');

    } catch (err) {
      log.error({
        err,
        provider: 'paystack',
        event: event.event,
        reference: event.data?.reference,
      }, 'payment.webhook_processing_failed');
      return res.status(500).json({ error: 'Webhook processing failed' });
    }
  }

  res.json({ received: true });
};

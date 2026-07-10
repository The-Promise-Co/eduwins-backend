import { Request, Response } from 'express';
import crypto from 'crypto';
import { db } from '../../database/db';
import { transactions, bookings } from '../../database/schema';
import { eq } from 'drizzle-orm';
import { enrollUserInCourse } from '../courses/enrollment';
import { settleCoursePayment } from './verifyPayment';
import logger from '../../utils/logger';

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
        await db.update(bookings)
          .set({
            status: 'paid_escrow',
            paymentReference: event.data.reference
          })
          .where(eq(bookings.id, metadata.booking_id));

        log.info({
          bookingId: metadata.booking_id,
          reference: event.data.reference,
          provider: 'paystack',
        }, 'payment.webhook_booking_marked_paid');
      }

      if (metadata.course_id && metadata.user_id) {
        const enrollmentResult = await enrollUserInCourse(metadata.course_id, metadata.user_id);
        const amount = event.data.amount / 100;
        await settleCoursePayment({
          amount,
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

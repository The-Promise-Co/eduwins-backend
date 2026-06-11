import { Request, Response } from 'express';
import axios from 'axios';
import crypto from 'crypto';
import { db } from '../database/db';
import { transactions, bookings, courseEnrollments, courses } from '../database/schema';
import { eq, and, sql } from 'drizzle-orm';
import dotenv from 'dotenv';
import { log } from 'console';

dotenv.config();

interface AuthenticatedRequest extends Request {
  user?: { id: string; email?: string; role?: string };
}

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

export const initializePayment = async (req: AuthenticatedRequest, res: Response) => {
  const { email, amount, currency, reference, callback_url, course_id } = req.body;
  const userId = req.user?.id;

  if (!PAYSTACK_SECRET) {
    return res.status(500).json({ error: 'Paystack not configured' });
  }

  const metadata: Record<string, any> = {};
  if (course_id) metadata.course_id = course_id;
  if (userId) metadata.user_id = userId;

  try {
    const response = await axios.post('https://api.paystack.co/transaction/initialize', {
      email,
      amount: Math.round(amount * 100),
      currency: currency || 'NGN',
      reference,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      callback_url: callback_url || `${process.env.FRONTEND_URL}/payment-success`,
    }, {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        'Content-Type': 'application/json',
      },
    });
    log('Paystack initialize response:', response.data);
    res.json(response.data.data);
  } catch (err: any) {
    console.error('Paystack initialize error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Payment initialization failed' });
  }
};

export const verifyPayment = async (req: Request, res: Response) => {
  const { reference } = req.params;

  if (!PAYSTACK_SECRET) {
    return res.status(500).json({ error: 'Paystack not configured' });
  }

  try {
    const response = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
      },
    });

    const data = response.data.data;

    // Record transaction using Drizzle
    const transactionId = Math.random().toString(36).substring(2, 15);
    await db.insert(transactions).values({
      id: transactionId,
      bookingId: data.metadata?.booking_id || null,
      teacherId: data.metadata?.teacher_id || null,
      amount: (data.amount / 100).toString(),
      type: 'payment_in',
      metadata: data,
    });

    // If this was a course payment, enroll the user
    if (data.metadata?.course_id && data.metadata?.user_id) {
      const courseId = data.metadata.course_id;
      const userId = data.metadata.user_id;

      const [existing] = await db.select({ id: courseEnrollments.id })
        .from(courseEnrollments)
        .where(
          and(
            eq(courseEnrollments.courseId, courseId),
            eq(courseEnrollments.userId, userId)
          )
        )
        .limit(1);

      if (!existing) {
        await db.insert(courseEnrollments).values({ courseId, userId });
        await db.update(courses)
          .set({ enrolled_count: sql`${courses.enrolled_count} + 1` })
          .where(eq(courses.id, courseId));
      }
    }

    res.json(data);
  } catch (err: any) {
    console.error('Paystack verify error:', err.response?.data || err.message);
    return res.status(500).json({ error: 'Could not verify payment' });
  }
};

export const paystackWebhook = async (req: Request, res: Response) => {
  const hash = req.headers['x-paystack-signature'] as string;
  const secret = process.env.PAYSTACK_SECRET_KEY;

  if (!secret) return res.status(500).json({ error: 'Paystack not configured' });

  const body = JSON.stringify(req.body);
  const expectedHash = crypto.createHmac('sha512', secret).update(body).digest('hex');

  if (expectedHash !== hash) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  const event = req.body;

  if (event.event === 'charge.success') {
    try {
      const metadata = event.data.metadata || {};

      // Handle booking payment
      if (metadata.booking_id) {
        await db.update(bookings)
          .set({
            status: 'paid_escrow',
            paymentReference: event.data.reference
          })
          .where(eq(bookings.id, metadata.booking_id));
      }

      // Handle course enrollment payment
      if (metadata.course_id && metadata.user_id) {
        const [existing] = await db.select({ id: courseEnrollments.id })
          .from(courseEnrollments)
          .where(
            and(
              eq(courseEnrollments.courseId, metadata.course_id),
              eq(courseEnrollments.userId, metadata.user_id)
            )
          )
          .limit(1);

        if (!existing) {
          await db.insert(courseEnrollments).values({
            courseId: metadata.course_id,
            userId: metadata.user_id,
          });
          await db.update(courses)
            .set({ enrolled_count: sql`${courses.enrolled_count} + 1` })
            .where(eq(courses.id, metadata.course_id));
        }
      }

      const transactionId = Math.random().toString(36).substring(2, 15);
      await db.insert(transactions).values({
        id: transactionId,
        bookingId: metadata.booking_id || null,
        teacherId: metadata.teacher_id || null,
        amount: (event.data.amount / 100).toString(),
        type: 'payment_in',
        metadata: event.data,
      });

    } catch (err) {
      console.error('Paystack webhook processing failed:', err);
      return res.status(500).json({ error: 'Webhook processing failed' });
    }
  }

  res.json({ received: true });
};

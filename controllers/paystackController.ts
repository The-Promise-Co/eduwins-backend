import { Request, Response } from 'express';
import axios from 'axios';
import crypto from 'crypto';
import { db } from '../database/db';
import { transactions, bookings } from '../database/schema';
import { eq } from 'drizzle-orm';
import dotenv from 'dotenv';

dotenv.config();

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

export const initializePayment = async (req: Request, res: Response) => {
  const { email, amount, currency, reference, callback_url } = req.body;

  if (!PAYSTACK_SECRET) {
    return res.status(500).json({ error: 'Paystack not configured' });
  }

  try {
    const response = await axios.post('https://api.paystack.co/transaction/initialize', {
      email,
      amount: Math.round(amount * 100),
      currency: currency || 'NGN',
      reference,
      callback_url: callback_url || `${process.env.FRONTEND_URL}/payment-success`,
    }, {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        'Content-Type': 'application/json',
      },
    });

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
    // handle business logic: update booking, release funds to teacher, etc.
    try {
      const metadata = event.data.metadata || {};

      if (metadata.booking_id) {
        await db.update(bookings)
          .set({ 
            status: 'paid_escrow', 
            paymentReference: event.data.reference 
          })
          .where(eq(bookings.id, metadata.booking_id));
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

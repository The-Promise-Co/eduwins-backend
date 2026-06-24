import { Request, Response } from 'express';
import axios from 'axios';
import { db } from '../../database/db';
import { courses } from '../../database/schema';
import { eq } from 'drizzle-orm';
import { log } from 'console';

interface AuthenticatedRequest extends Request {
  user?: { id: string; email?: string; role?: string };
}

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

type InitializePaystackInput = {
  email: string;
  amount: number;
  currency?: string;
  reference?: string;
  callback_url?: string;
  metadata?: Record<string, any>;
};

export const initializePaystackTransaction = async ({
  email,
  amount,
  currency,
  reference,
  callback_url,
  metadata,
}: InitializePaystackInput) => {
  if (!PAYSTACK_SECRET) {
    throw new Error('Paystack not configured');
  }

  const response = await axios.post('https://api.paystack.co/transaction/initialize', {
    email,
    amount: Math.round(amount * 100),
    currency: currency || 'NGN',
    reference,
    metadata: metadata && Object.keys(metadata).length > 0 ? metadata : undefined,
    callback_url: callback_url,
  }, {
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET}`,
      'Content-Type': 'application/json',
    },
  });

  const data = response.data.data;
  return {
    ...data,
    authorizationUrl: data.authorization_url,
  };
};

export const initializePayment = async (req: AuthenticatedRequest, res: Response) => {
  const { email, amount, currency, reference, callback_url, course_id } = req.body;
  const userId = req.user?.id;

  if (!PAYSTACK_SECRET) {
    return res.status(500).json({ error: 'Paystack not configured' });
  }

  const metadata: Record<string, any> = {};
  if (course_id) {
    if (!userId) {
      return res.status(401).json({ error: 'Login required to purchase this course' });
    }

    const [course] = await db.select({ id: courses.id, price: courses.price, is_free: courses.is_free })
      .from(courses)
      .where(eq(courses.id, course_id))
      .limit(1);

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    if (course.is_free) {
      return res.status(400).json({ error: 'This course is free. Use the enroll endpoint instead.' });
    }

    const expectedAmount = Number(course.price || 0);
    if (expectedAmount <= 0 || Number(amount) !== expectedAmount) {
      return res.status(400).json({ error: 'Invalid course payment amount' });
    }

    metadata.course_id = course_id;
    metadata.user_id = userId;
    metadata.payment_for = 'course';
  } else if (userId) {
    metadata.user_id = userId;
  }

  try {
    const data = await initializePaystackTransaction({
      email,
      amount: Number(amount),
      currency,
      reference,
      callback_url: callback_url || (course_id
        ? `${process.env.FRONTEND_URL}/courses/payment/confirm`
        : `${process.env.FRONTEND_URL}/payment-success`),
      metadata,
    });
    log('Paystack initialize response:', data);
    res.json(data);
  } catch (err: any) {
    console.error('Paystack initialize error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Payment initialization failed' });
  }
};

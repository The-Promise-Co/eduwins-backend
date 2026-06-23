import { Request, Response } from 'express';
import axios from 'axios';
import { db } from '../../database/db';
import { transactions } from '../../database/schema';
import { enrollUserInCourse } from '../courses/enrollment';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

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

    if (data.status !== 'success') {
      return res.status(400).json({ error: 'Payment was not successful', payment: data });
    }

    const transactionId = Math.random().toString(36).substring(2, 15);
    await db.insert(transactions).values({
      id: transactionId,
      bookingId: data.metadata?.booking_id || null,
      teacherId: data.metadata?.teacher_id || null,
      amount: (data.amount / 100).toString(),
      type: 'payment_in',
      metadata: data,
    });

    let enrollmentResult: Awaited<ReturnType<typeof enrollUserInCourse>> | null = null;

    if (data.metadata?.course_id && data.metadata?.user_id) {
      const courseId = data.metadata.course_id;
      const userId = data.metadata.user_id;

      enrollmentResult = await enrollUserInCourse(courseId, userId);
    }

    res.json({
      ...data,
      course_id: data.metadata?.course_id,
      user_id: data.metadata?.user_id,
      enrolled: !!enrollmentResult,
      alreadyEnrolled: enrollmentResult?.alreadyEnrolled || false,
    });
  } catch (err: any) {
    console.error('Paystack verify error:', err.response?.data || err.message);
    return res.status(500).json({ error: 'Could not verify payment' });
  }
};

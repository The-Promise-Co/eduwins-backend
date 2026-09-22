import { Request, Response } from 'express';
import axios from 'axios';
import { db } from '../../database/db';
import { bookings, courses } from '../../database/schema';
import { eq } from 'drizzle-orm';
import logger from '../../utils/logger';
import { getBookingPaymentWindowHours } from '../../services/systemSettingsService';
import { calculatePaystackFee } from '../../utils/paystackFees';

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
  const { email, amount, currency, reference, callback_url, course_id, booking_id, bookingId } = req.body;
  const bookingIdValue = booking_id || bookingId;
  const userId = req.user?.id;
  const log = (req as any).log || logger;

  if (!PAYSTACK_SECRET) {
    return res.status(500).json({ error: 'Paystack not configured' });
  }

  const metadata: Record<string, any> = {};
  if (bookingIdValue) {
    if (!userId) {
      return res.status(401).json({ error: 'Login required to pay for this booking' });
    }
    if (!email) {
      return res.status(400).json({ error: 'Email is required to start payment' });
    }

    const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingIdValue) });
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    if (booking.parentId !== userId) {
      return res.status(403).json({ error: 'You cannot pay for this booking' });
    }
    if (booking.status !== 'accepted') {
      return res.status(400).json({ error: 'Only accepted bookings can be paid for' });
    }
    if (booking.paidAt) {
      return res.status(400).json({ error: 'This booking has already been paid for' });
    }
    if (!booking.acceptedAt) {
      return res.status(400).json({ error: 'This booking is missing its acceptance time' });
    }

    const paymentWindowHours = await getBookingPaymentWindowHours();
    const acceptedTime = new Date(booking.acceptedAt).getTime();
    if (!Number.isFinite(acceptedTime)) {
      return res.status(400).json({ error: 'This booking has an invalid acceptance time' });
    }
    if (acceptedTime + paymentWindowHours * 60 * 60 * 1000 < Date.now()) {
      await db.update(bookings)
        .set({ status: 'cancelled', cancelledAt: new Date(), cancelledBy: 'system', updatedAt: new Date() })
        .where(eq(bookings.id, booking.id));
      return res.status(410).json({ error: 'Payment window has expired and this booking was cancelled' });
    }

    // Platform policy: Paystack processing fees are pushed to the customer.
    // The parent is charged total + fee so the merchant always nets the full
    // booking total and splits are computed on that exact figure.
    const totalAmount = Number(booking.totalAmount || 0);
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return res.status(400).json({ error: 'This booking total is not available' });
    }
    const processingFee = calculatePaystackFee(totalAmount);
    const expectedCharge = totalAmount + processingFee;
    if (Number(amount) !== expectedCharge) {
      return res.status(400).json({ error: 'Invalid booking payment amount' });
    }

    metadata.payment_for = 'booking';
    metadata.booking_id = booking.id;
    metadata.teacher_id = booking.teacherId;
    metadata.parent_id = booking.parentId;
    metadata.user_id = userId;
    metadata.total_amount = totalAmount;
    metadata.processing_fee = processingFee;

    try {
      log.info({ userId, bookingId: booking.id, reference, amount: Number(amount), currency: currency || 'NGN' }, 'payment.initialize_started');

      const data = await initializePaystackTransaction({
        email,
        amount: Number(amount),
        currency,
        reference,
        callback_url: callback_url || `${process.env.FRONTEND_URL}/bookings/payment/confirm`,
        metadata,
      });

      log.info({ userId, bookingId: booking.id, reference: data.reference || reference, amount: Number(amount), currency: currency || 'NGN', provider: 'paystack', hasAuthorizationUrl: Boolean(data.authorizationUrl) }, 'payment.initialize_succeeded');

      return res.json({ ...data, totalAmount, processingFee, chargeAmount: expectedCharge });
    } catch (err: any) {
      log.error({ err, userId, bookingId: booking.id, reference, amount: Number(amount), currency: currency || 'NGN', provider: 'paystack', providerError: err.response?.data }, 'payment.initialize_failed');
      return res.status(500).json({ error: 'Payment initialization failed' });
    }
  }
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

    // Same policy as bookings: fees pushed to the customer so the merchant
    // nets the full course price and splits run on that exact figure.
    const coursePrice = Number(course.price || 0);
    if (coursePrice <= 0) {
      return res.status(400).json({ error: 'This course price is not available' });
    }
    const courseFee = calculatePaystackFee(coursePrice);
    if (Number(amount) !== coursePrice + courseFee) {
      return res.status(400).json({ error: 'Invalid course payment amount' });
    }

    metadata.course_id = course_id;
    metadata.user_id = userId;
    metadata.payment_for = 'course';
    metadata.course_price = coursePrice;
    metadata.processing_fee = courseFee;
  } else if (userId) {
    metadata.user_id = userId;
  }

  try {
    log.info({
      userId,
      courseId: course_id,
      reference,
      amount: Number(amount),
      currency: currency || 'NGN',
    }, 'payment.initialize_started');

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

    log.info({
      userId,
      courseId: course_id,
      reference: data.reference || reference,
      amount: Number(amount),
      currency: currency || 'NGN',
      provider: 'paystack',
      hasAuthorizationUrl: Boolean(data.authorizationUrl),
    }, 'payment.initialize_succeeded');

    if (course_id) {
      const price = Number(metadata.course_price || 0);
      const fee = Number(metadata.processing_fee || 0);
      return res.json({ ...data, coursePrice: price, processingFee: fee, chargeAmount: price + fee });
    }

    res.json(data);
  } catch (err: any) {
    log.error({
      err,
      userId,
      courseId: course_id,
      reference,
      amount: Number(amount),
      currency: currency || 'NGN',
      provider: 'paystack',
      providerError: err.response?.data,
    }, 'payment.initialize_failed');
    res.status(500).json({ error: 'Payment initialization failed' });
  }
};

// GET /paystack/quote?booking_id= or ?course_id= — fee breakdown for the
// payment UI. The customer is charged price + fee; the merchant always nets
// the full price.
export const getBookingQuote = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const courseId = (req.query.course_id as string) || '';
    if (courseId) {
      const [course] = await db.select({ id: courses.id, price: courses.price, is_free: courses.is_free })
        .from(courses)
        .where(eq(courses.id, courseId))
        .limit(1);
      if (!course) return res.status(404).json({ error: 'Course not found' });
      const coursePrice = Number(course.price || 0);
      if (course.is_free || !Number.isFinite(coursePrice) || coursePrice <= 0) {
        return res.status(400).json({ error: 'This course price is not available' });
      }
      const processingFee = calculatePaystackFee(coursePrice);
      return res.json({
        courseId: course.id,
        totalAmount: coursePrice,
        processingFee,
        chargeAmount: coursePrice + processingFee,
        currency: 'NGN',
      });
    }

    const bookingId = (req.query.booking_id as string) || '';
    if (!bookingId) return res.status(400).json({ error: 'booking_id or course_id is required' });

    const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId) });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.parentId !== req.user?.id) {
      return res.status(403).json({ error: 'You cannot pay for this booking' });
    }

    const totalAmount = Number(booking.totalAmount || 0);
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return res.status(400).json({ error: 'This booking total is not available' });
    }
    const processingFee = calculatePaystackFee(totalAmount);

    res.json({
      bookingId: booking.id,
      totalAmount,
      processingFee,
      chargeAmount: totalAmount + processingFee,
      currency: 'NGN',
    });
  } catch (err: any) {
    logger.error({ err }, 'Booking quote error');
    res.status(500).json({ error: 'Failed to build payment quote' });
  }
};

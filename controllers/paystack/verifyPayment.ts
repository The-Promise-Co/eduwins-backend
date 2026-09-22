import { Request, Response } from 'express';
import axios from 'axios';
import { and, eq, isNull, isNotNull, lte } from 'drizzle-orm';
import { db } from '../../database/db';
import { platformConfigs, transactions, bookings, courses } from '../../database/schema';
import { enrollUserInCourse } from '../courses/enrollment';
import { creditWallet, ensurePlatformWallet, ensureUserWallets } from '../../services/walletService';
import logger from '../../utils/logger';
import { createNotification } from '../notificationController';
import { getBookingPaymentWindowHours } from '../../services/systemSettingsService';
import { calculatePaystackFee } from '../../utils/paystackFees';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

const settleBookingPayment = async ({
  metadata,
  paymentData,
  log = logger,
}: {
  metadata: Record<string, any>;
  paymentData: Record<string, any>;
  log?: typeof logger;
}) => {
  const bookingId = metadata.booking_id;
  const teacherId = metadata.teacher_id;
  const parentId = metadata.parent_id;
  const paystackReference = paymentData.reference;

  if (!bookingId || !teacherId || !parentId) {
    log.warn({ metadata, reference: paystackReference }, 'payment.booking_missing_ids');
    return { success: false, error: 'Booking metadata incomplete' };
  }

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
    }, 'payment.booking_settlement_skipped_existing_transaction');
    return { success: true, skipped: true, transactionId: existingTransaction.id };
  }

  const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId) });
  if (!booking) {
    log.warn({ bookingId, reference: paystackReference }, 'payment.booking_not_found');
    return { success: false, error: 'Booking not found' };
  }

  if (booking.status !== 'accepted') {
    log.warn({ bookingId, status: booking.status, reference: paystackReference }, 'payment.booking_not_accepted');
    return { success: false, error: 'Booking is not in accepted status' };
  }

  if (booking.paidAt) {
    log.warn({ bookingId, reference: paystackReference }, 'payment.booking_already_paid');
    return { success: false, error: 'Booking already paid' };
  }

  if (!booking.acceptedAt) {
    log.warn({ bookingId, reference: paystackReference }, 'payment.booking_missing_accepted_at');
    return { success: false, error: 'Booking missing acceptance time' };
  }

  const paymentWindowHours = await getBookingPaymentWindowHours();
  const acceptedTime = new Date(booking.acceptedAt).getTime();
  if (!Number.isFinite(acceptedTime) || acceptedTime + paymentWindowHours * 60 * 60 * 1000 < Date.now()) {
    await db.update(bookings)
      .set({ status: 'cancelled', cancelledAt: new Date(), cancelledBy: 'system', updatedAt: new Date() })
      .where(eq(bookings.id, bookingId));
    log.warn({ bookingId, reference: paystackReference }, 'payment.booking_expired_cancelled');
    return { success: false, error: 'Payment window expired' };
  }

  // Platform policy: the customer is charged total + fee, so the merchant
  // nets the full total. Validate the gross charged figure and record the
  // fee breakdown on the row; the stored amount is the escrow basis.
  const escrowAmount = Number(booking.totalAmount || 0);
  if (!Number.isFinite(escrowAmount) || escrowAmount <= 0) {
    log.warn({ bookingId, reference: paystackReference }, 'payment.booking_missing_total');
    return { success: false, error: 'Booking total is not available' };
  }
  const expectedFee = calculatePaystackFee(escrowAmount);
  const chargedAmount = Number(paymentData.amount || 0) / 100;
  if (chargedAmount !== escrowAmount + expectedFee) {
    log.warn({ bookingId, escrowAmount, expectedFee, chargedAmount, reference: paystackReference }, 'payment.booking_amount_mismatch');
    return { success: false, error: 'Payment amount mismatch' };
  }
  const paystackFee = Number(paymentData.fees || 0) / 100;

  const transactionId = Math.random().toString(36).substring(2, 15);
  await db.insert(transactions).values({
    id: transactionId,
    bookingId,
    teacherId,
    paystackReference: paystackReference || null,
    amount: escrowAmount.toString(),
    type: 'booking_escrow_payment',
    metadata: {
      ...paymentData,
      parentId,
      escrowAmount,
      chargedAmount,
      paystackFee,
      feeBearer: 'customer',
    },
  });

  const now = new Date();
  await db.update(bookings)
    .set({
      status: 'paid_escrow',
      paidAt: now,
      paymentReference: paystackReference,
      updatedAt: now,
    })
    .where(eq(bookings.id, bookingId));

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
  }, 'payment.booking_settlement_succeeded');

  return { success: true, transactionId };
};

export const calculateCourseSplits = async (amount: number) => {
  const configs = await db.select().from(platformConfigs).where(eq(platformConfigs.isActive, true));

  const amountFor = (target: string, fallbackPercentage: number) => {
    const config = configs.find((item) => item.target === target);
    if (!config) return (amount * fallbackPercentage) / 100;

    const value = Number(config.value || 0);
    return config.valueType === 'flat_fee' ? value : (amount * value) / 100;
  };

  const platformFee = amountFor('platform_fee', 15);
  const welfareAmount = amountFor('welfare', 10);
  const tutorConfig = configs.find((item) => item.target === 'tutor');
  const tutorAmount = tutorConfig
    ? amountFor('tutor', 75)
    : Math.max(0, amount - platformFee - welfareAmount);

  return {
    tutorAmount,
    platformFee,
    welfareAmount,
    config: configs.map((config) => ({
      key: config.key,
      target: config.target,
      valueType: config.valueType,
      value: config.value,
    })),
  };
};

export const settleCoursePayment = async ({
  metadata,
  paymentData,
  enrollmentResult,
  log = logger,
}: {
  metadata: Record<string, any>;
  paymentData: Record<string, any>;
  enrollmentResult: Awaited<ReturnType<typeof enrollUserInCourse>> | null;
  log?: typeof logger;
}) => {
  // One rule for courses and bookings alike: the customer is charged price +
  // fee, the merchant nets the full price, splits run on the price, and the
  // fee is saved on the row — never folded into the value.
  // Grace path: payments initialized before this deploy charged the exact
  // price (merchant absorbed the fee); those settle with feeBearer platform.
  const chargedAmount = Number(paymentData.amount || 0) / 100;
  const actualFee = Number(paymentData.fees || 0) / 100;
  let price = Number(metadata.course_price || 0);
  if (!price && metadata.course_id) {
    const [course] = await db.select({ price: courses.price })
      .from(courses)
      .where(eq(courses.id, metadata.course_id as string))
      .limit(1);
    price = Number(course?.price || 0);
  }
  if (!price) price = chargedAmount;
  const expectedFee = calculatePaystackFee(price);
  const feeBearer =
    chargedAmount === price + expectedFee ? 'customer'
    : chargedAmount === price ? 'platform'
    : 'unknown';
  if (feeBearer === 'unknown') {
    log.warn({
      reference: paymentData.reference,
      courseId: metadata.course_id,
      price,
      expectedFee,
      chargedAmount,
    }, 'payment.course_amount_unrecognized');
  }

  const splits = await calculateCourseSplits(price);
  const alreadyEnrolled = enrollmentResult?.alreadyEnrolled || false;
  const paystackReference = paymentData.reference;

  if (paystackReference) {
    const existingTransaction = await db.query.transactions.findFirst({
      where: eq(transactions.paystackReference, paystackReference),
    });

    if (existingTransaction) {
      log.info({
        reference: paystackReference,
        transactionId: existingTransaction.id,
        courseId: metadata.course_id,
        userId: metadata.user_id,
        teacherId: metadata.teacher_id,
      }, 'payment.settlement_skipped_existing_transaction');
      return { splits, transactionId: existingTransaction.id, walletTransactions: [] };
    }
  }

  if (!enrollmentResult || alreadyEnrolled) {
    log.info({
      reference: paystackReference,
      courseId: metadata.course_id,
      userId: metadata.user_id,
      teacherId: metadata.teacher_id,
      alreadyEnrolled,
      hasEnrollment: Boolean(enrollmentResult),
    }, 'payment.settlement_skipped_no_enrollment');
    return { splits, transactionId: null, walletTransactions: [] };
  }

  const transactionId = Math.random().toString(36).substring(2, 15);
  await db.insert(transactions).values({
    id: transactionId,
    teacherId: metadata.teacher_id || null,
    paystackReference: paystackReference || null,
    amount: price.toString(),
    type: 'course_payment',
    metadata: {
      ...paymentData,
      coursePrice: price,
      chargedAmount,
      paystackFee: actualFee,
      feeBearer,
      splits,
      enrollment: enrollmentResult?.enrollment || null,
      alreadyEnrolled,
      walletsUpdated: !!metadata.teacher_id && !!enrollmentResult && !alreadyEnrolled,
    },
  });

  if (!metadata.teacher_id) {
    log.warn({
      reference: paystackReference,
      transactionId,
      courseId: metadata.course_id,
      userId: metadata.user_id,
    }, 'payment.settlement_skipped_missing_teacher');
    return { splits, transactionId, walletTransactions: [] };
  }

  await ensureUserWallets(metadata.teacher_id, 'teacher');
  await ensurePlatformWallet();

  const referenceId = paymentData.reference || transactionId;
  const commonMetadata = {
    courseId: metadata.course_id,
    userId: metadata.user_id,
    teacherId: metadata.teacher_id,
    paystackReference: paymentData.reference,
    transactionId,
  };

  const walletTransactions = [];

  if (splits.tutorAmount > 0) {
    walletTransactions.push(await creditWallet({
      ownerId: metadata.teacher_id,
      walletType: 'main',
      amount: splits.tutorAmount,
      type: 'course_earning',
      referenceType: 'course_payment',
      referenceId,
      description: 'Course earning credited',
      metadata: commonMetadata,
    }));
  }

  await createNotification({
    userId: metadata.teacher_id,
    type: 'course_payment',
    title: 'Course payment received',
    message: `A course payment of ₦${price.toLocaleString()} was received.`,
  });

  if (splits.welfareAmount > 0) {
    walletTransactions.push(await creditWallet({
      ownerId: metadata.teacher_id,
      walletType: 'welfare',
      amount: splits.welfareAmount,
      type: 'course_welfare_contribution',
      referenceType: 'course_payment',
      referenceId,
      description: 'Course welfare contribution credited',
      metadata: commonMetadata,
    }));
  }

  if (splits.platformFee > 0) {
    walletTransactions.push(await creditWallet({
      ownerType: 'platform',
      ownerId: null,
      walletType: 'fees',
      amount: splits.platformFee,
      type: 'course_platform_fee',
      referenceType: 'course_payment',
      referenceId,
      description: 'Course platform fee credited',
      metadata: commonMetadata,
    }));
  }

  log.info({
    reference: paystackReference,
    transactionId,
    courseId: metadata.course_id,
    userId: metadata.user_id,
    teacherId: metadata.teacher_id,
    coursePrice: price,
    chargedAmount,
    paystackFee: actualFee,
    feeBearer,
    tutorAmount: splits.tutorAmount,
    welfareAmount: splits.welfareAmount,
    platformFee: splits.platformFee,
    walletTransactionCount: walletTransactions.length,
  }, 'payment.settlement_succeeded');

  return { splits, transactionId, walletTransactions };
};

export const verifyPayment = async (req: Request, res: Response) => {
  const { reference } = req.params;
  const log = (req as any).log || logger;

  if (!PAYSTACK_SECRET) {
    return res.status(500).json({ error: 'Paystack not configured' });
  }

  try {
    log.info({ reference, provider: 'paystack' }, 'payment.verify_started');

    const response = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
      },
    });

    const data = response.data.data;

    if (data.status !== 'success') {
      log.warn({
        reference,
        provider: 'paystack',
        status: data.status,
        gatewayResponse: data.gateway_response,
      }, 'payment.verify_unsuccessful');
      return res.status(400).json({ error: 'Payment was not successful', payment: data });
    }

    let enrollmentResult: Awaited<ReturnType<typeof enrollUserInCourse>> | null = null;
    const actualAmount = (data.amount - (data.fees || 0)) / 100;
    const metadata = data.metadata || {};

    if (metadata.course_id && metadata.user_id) {
      const courseId = metadata.course_id;
      const userId = metadata.user_id;

      enrollmentResult = await enrollUserInCourse(courseId, userId);
      await settleCoursePayment({
        metadata,
        paymentData: data,
        enrollmentResult,
        log,
      });
    } else if (metadata.payment_for === 'booking' && metadata.booking_id) {
      const settlement = await settleBookingPayment({
        metadata,
        paymentData: data,
        log,
      });

      if (!settlement.success) {
        log.warn({ bookingId: metadata.booking_id, reference, error: settlement.error }, 'payment.booking_settlement_failed');
        return res.status(400).json({ error: settlement.error || 'Booking payment settlement failed' });
      }
    } else {
      const transactionId = Math.random().toString(36).substring(2, 15);
      await db.insert(transactions).values({
        id: transactionId,
        bookingId: metadata.booking_id || null,
        teacherId: metadata.teacher_id || null,
        paystackReference: data.reference || null,
        amount: actualAmount.toString(),
        type: 'payment_in',
        metadata: data,
      });

      log.info({
        reference: data.reference || reference,
        transactionId,
        bookingId: metadata.booking_id,
        teacherId: metadata.teacher_id,
        amount: actualAmount,
        provider: 'paystack',
      }, 'payment.transaction_recorded');
    }

    log.info({
      reference: data.reference || reference,
      amount: actualAmount,
      courseId: metadata.course_id,
      userId: metadata.user_id,
      enrolled: Boolean(enrollmentResult),
      alreadyEnrolled: enrollmentResult?.alreadyEnrolled || false,
      provider: 'paystack',
    }, 'payment.verify_succeeded');

    res.json({
      // ...data,
      course_id: metadata.course_id,
      booking_id: metadata.booking_id,
      user_id: metadata.user_id,
      enrolled: !!enrollmentResult,
      alreadyEnrolled: enrollmentResult?.alreadyEnrolled || false,
      enrollment: enrollmentResult?.enrollment || null,
    });
  } catch (err: any) {
    log.error({
      err,
      reference,
      provider: 'paystack',
      providerError: err.response?.data,
    }, 'payment.verify_failed');
    return res.status(500).json({ error: 'Could not verify payment' });
  }
};

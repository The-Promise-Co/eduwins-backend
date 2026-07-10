import { Request, Response } from 'express';
import axios from 'axios';
import { db } from '../../database/db';
import { platformConfigs, transactions } from '../../database/schema';
import { eq } from 'drizzle-orm';
import { enrollUserInCourse } from '../courses/enrollment';
import { creditWallet, ensurePlatformWallet, ensureUserWallets } from '../../services/walletService';
import logger from '../../utils/logger';
import { createNotification } from '../notificationController';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

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
  amount,
  metadata,
  paymentData,
  enrollmentResult,
  log = logger,
}: {
  amount: number;
  metadata: Record<string, any>;
  paymentData: Record<string, any>;
  enrollmentResult: Awaited<ReturnType<typeof enrollUserInCourse>> | null;
  log?: typeof logger;
}) => {
  const splits = await calculateCourseSplits(amount);
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
    amount: amount.toString(),
    type: 'course_payment',
    metadata: {
      ...paymentData,
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
    message: `A course payment of ₦${amount.toLocaleString()} was received.`,
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
    amount,
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
    const amount = data.amount / 100;
    const metadata = data.metadata || {};

    if (metadata.course_id && metadata.user_id) {
      const courseId = metadata.course_id;
      const userId = metadata.user_id;

      enrollmentResult = await enrollUserInCourse(courseId, userId);
      await settleCoursePayment({
        amount,
        metadata,
        paymentData: data,
        enrollmentResult,
        log,
      });
    } else {
      const transactionId = Math.random().toString(36).substring(2, 15);
      await db.insert(transactions).values({
        id: transactionId,
        bookingId: metadata.booking_id || null,
        teacherId: metadata.teacher_id || null,
        paystackReference: data.reference || null,
        amount: amount.toString(),
        type: 'payment_in',
        metadata: data,
      });

      log.info({
        reference: data.reference || reference,
        transactionId,
        bookingId: metadata.booking_id,
        teacherId: metadata.teacher_id,
        amount,
        provider: 'paystack',
      }, 'payment.transaction_recorded');
    }

    log.info({
      reference: data.reference || reference,
      amount,
      courseId: metadata.course_id,
      userId: metadata.user_id,
      enrolled: Boolean(enrollmentResult),
      alreadyEnrolled: enrollmentResult?.alreadyEnrolled || false,
      provider: 'paystack',
    }, 'payment.verify_succeeded');

    res.json({
      // ...data,
      course_id: metadata.course_id,
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

import { and, eq, ne } from 'drizzle-orm';
import { db } from '../database/db';
import {
  teacherProfiles,
  transactions,
  tutorSubscriptions,
} from '../database/schema';
import { SEARCH_RANK_BY_VISIBILITY, termEndFromNow } from './subscriptionService';
import { creditReferralReward } from '../controllers/authController';
import { createNotification } from '../controllers/notificationController';
import logger from '../utils/logger';

/**
 * Subscription settlement — shared by the Paystack verify callback and the
 * webhook. Idempotent by Paystack reference and by subscription status, so
 * callback/webhook arrival order and retries can never grant duplicate
 * access or double-credit referral rewards.
 */
export const settleSubscriptionPayment = async ({
  subscriptionId,
  paystackReference,
  paymentData,
  log = logger,
}: {
  subscriptionId?: string;
  paystackReference: string;
  paymentData: Record<string, any>;
  log?: typeof logger;
}): Promise<{ success: boolean; skipped?: boolean; error?: string; subscriptionId?: string }> => {
  // Locate the checkout row — prefer the explicit id, fall back to reference.
  const subscription = subscriptionId
    ? await db.query.tutorSubscriptions.findFirst({ where: eq(tutorSubscriptions.id, subscriptionId) })
    : await db.query.tutorSubscriptions.findFirst({ where: eq(tutorSubscriptions.paystackReference, paystackReference) });

  if (!subscription) {
    log.warn({ paystackReference, subscriptionId }, 'payment.subscription_not_found');
    return { success: false, error: 'Subscription checkout not found' };
  }

  if (subscription.status === 'active') {
    log.info({ subscriptionId: subscription.id, reference: paystackReference }, 'payment.subscription_already_active');
    return { success: true, skipped: true, subscriptionId: subscription.id };
  }

  if (subscription.status !== 'pending') {
    log.warn({ subscriptionId: subscription.id, status: subscription.status }, 'payment.subscription_bad_status');
    return { success: false, error: `Subscription is ${subscription.status}` };
  }

  // Guard against a different charge settling this checkout row.
  if (subscription.paystackReference && subscription.paystackReference !== paystackReference) {
    log.warn({ subscriptionId: subscription.id, expected: subscription.paystackReference, got: paystackReference }, 'payment.subscription_reference_mismatch');
    return { success: false, error: 'Payment reference mismatch' };
  }

  // The charged figure includes Paystack's pass-fees markup; the value is
  // charged − fee and must cover the price we initialized with.
  const chargedAmount = Number(paymentData.amount || 0) / 100;
  const paystackFee = Number(paymentData.fees || 0) / 100;
  const value = chargedAmount - paystackFee;
  const expected = Number(subscription.amountPaid);
  if (!Number.isFinite(value) || value < expected) {
    log.warn({
      subscriptionId: subscription.id,
      chargedAmount,
      paystackFee,
      value,
      expected,
      reference: paystackReference,
    }, 'payment.subscription_amount_mismatch');
    return { success: false, error: 'Payment amount mismatch' };
  }

  // Transaction row first — its unique paystackReference makes duplicate
  // settlement attempts from concurrent verify/webhook calls fail loudly.
  const transactionId = Math.random().toString(36).substring(2, 15);
  try {
    await db.insert(transactions).values({
      id: transactionId,
      teacherId: subscription.tutorId,
      paystackReference: paystackReference || null,
      amount: value.toString(),
      type: 'tutor_subscription',
      metadata: {
        ...paymentData,
        subscriptionId: subscription.id,
        planSlug: subscription.planSlug,
        durationMonths: subscription.durationMonths,
        chargedAmount,
        paystackFee,
        value,
        feeBearer: 'customer',
      },
    });
  } catch (err: any) {
    if (err?.code === '23505') {
      log.info({ reference: paystackReference, transactionId }, 'payment.subscription_settlement_skipped_existing_transaction');
      return { success: true, skipped: true, subscriptionId: subscription.id };
    }
    throw err;
  }

  // Upgrades take effect immediately: the new term starts at the purchase
  // date and supersedes any still-active subscription (no proration).
  const now = new Date();
  const endsAt = termEndFromNow(subscription.durationMonths);

  await db
    .update(tutorSubscriptions)
    .set({ status: 'superseded', updatedAt: now })
    .where(
      and(
        eq(tutorSubscriptions.tutorId, subscription.tutorId),
        eq(tutorSubscriptions.status, 'active'),
        ne(tutorSubscriptions.id, subscription.id),
      ),
    );

  await db
    .update(tutorSubscriptions)
    .set({
      status: 'active',
      startsAt: now,
      endsAt,
      activatedAt: now,
      planSnapshot: subscription.planSnapshot,
      updatedAt: now,
    })
    .where(eq(tutorSubscriptions.id, subscription.id));

  // Premium search visibility rides with the term; expiry resets it.
  const features = subscription.planSnapshot?.features;
  if (features) {
    await db
      .update(teacherProfiles)
      .set({ searchRank: SEARCH_RANK_BY_VISIBILITY[features.searchVisibility] || 'normal', updatedAt: now })
      .where(eq(teacherProfiles.userId, subscription.tutorId));
  }

  // Referral reward: credited once, on the referee's first paid subscription.
  // Free tier never reaches this path because it has no checkout.
  if (!subscription.referralRewarded) {
    try {
      await creditReferralReward(
        subscription.tutorId,
        subscription.planSlug,
        Number(subscription.amountPaid),
      );
      await db
        .update(tutorSubscriptions)
        .set({ referralRewarded: true, updatedAt: now })
        .where(eq(tutorSubscriptions.id, subscription.id));
    } catch (err) {
      // Never fail settlement because of referral crediting.
      log.error({ err, subscriptionId: subscription.id }, 'payment.subscription_referral_reward_failed');
    }
  }

  await createNotification({
    userId: subscription.tutorId,
    type: 'subscription_activated',
    title: 'Subscription active',
    message: `Your ${subscription.planSnapshot?.name || subscription.planSlug} plan (${subscription.durationMonths} month${subscription.durationMonths > 1 ? 's' : ''}) is now active.`,
  });

  log.info({
    reference: paystackReference,
    subscriptionId: subscription.id,
    tutorId: subscription.tutorId,
    planSlug: subscription.planSlug,
    durationMonths: subscription.durationMonths,
    value,
    endsAt,
    transactionId,
  }, 'payment.subscription_settlement_succeeded');

  return { success: true, subscriptionId: subscription.id };
};

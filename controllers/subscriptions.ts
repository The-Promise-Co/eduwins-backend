import { Request, Response } from 'express';
import axios from 'axios';
import { randomBytes } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../database/db';
import { tutorSubscriptions, users } from '../database/schema';
import {
  DURATION_MONTHS,
  getEntitlements,
  getPlanBySlug,
  listActivePlans,
  priceForDuration,
  type DurationMonths,
} from '../services/subscriptionService';
import { settleSubscriptionPayment } from '../services/subscriptionPayment';
import logger from '../utils/logger';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

interface AuthenticatedRequest extends Request {
  user?: { id: string; role?: string };
}

const isDuration = (value: unknown): value is DurationMonths =>
  DURATION_MONTHS.includes(Number(value) as DurationMonths);

// Shared Paystack initialization — same call the booking/course flow uses.
const initializePaystackTransaction = async ({
  email,
  amount,
  currency,
  reference,
  callback_url,
  metadata,
}: {
  email: string;
  amount: number;
  currency?: string;
  reference: string;
  callback_url: string;
  metadata: Record<string, any>;
}) => {
  const response = await axios.post('https://api.paystack.co/transaction/initialize', {
    email,
    amount: Math.round(amount * 100),
    currency: currency || 'NGN',
    reference,
    metadata,
    callback_url,
  }, {
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET}`,
      'Content-Type': 'application/json',
    },
  });

  const data = response.data.data;
  return { ...data, authorizationUrl: data.authorization_url };
};

// ---------------------------------------------------------------------------
// GET /api/subscriptions/plans — public plan catalog
// ---------------------------------------------------------------------------

export const getPlans = async (_req: Request, res: Response) => {
  try {
    const plans = await listActivePlans();
    return res.json({ plans });
  } catch (err: any) {
    logger.error({ err }, 'subscription.plans_failed');
    return res.status(500).json({ error: 'Failed to load plans' });
  }
};

// ---------------------------------------------------------------------------
// GET /api/subscriptions/me — current status, entitlements, and history
// ---------------------------------------------------------------------------

export const getMySubscription = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tutorId = req.user!.id;
    const entitlements = await getEntitlements(tutorId);

    const history = await db
      .select({
        id: tutorSubscriptions.id,
        planSlug: tutorSubscriptions.planSlug,
        planSnapshot: tutorSubscriptions.planSnapshot,
        durationMonths: tutorSubscriptions.durationMonths,
        amountPaid: tutorSubscriptions.amountPaid,
        status: tutorSubscriptions.status,
        startsAt: tutorSubscriptions.startsAt,
        endsAt: tutorSubscriptions.endsAt,
        createdAt: tutorSubscriptions.createdAt,
      })
      .from(tutorSubscriptions)
      .where(eq(tutorSubscriptions.tutorId, tutorId));

    return res.json({
      ...entitlements,
      history: history.filter((row) => row.status === 'active' || row.status === 'expired'),
    });
  } catch (err: any) {
    logger.error({ err, tutorId: req.user?.id }, 'subscription.me_failed');
    return res.status(500).json({ error: 'Failed to load subscription' });
  }
};

// ---------------------------------------------------------------------------
// POST /api/subscriptions/checkout — body: { plan, duration }
// Returns the Paystack authorization URL. The browser sends a plan slug and
// a term length only; the amount is resolved server-side from the catalog.
// ---------------------------------------------------------------------------

export const startCheckout = async (req: AuthenticatedRequest, res: Response) => {
  const tutorId = req.user!.id;
  const log = (req as any).log || logger;

  if (!PAYSTACK_SECRET) {
    return res.status(500).json({ error: 'Paystack not configured' });
  }

  const { plan: planSlug, duration } = req.body || {};
  if (typeof planSlug !== 'string' || !isDuration(duration)) {
    return res.status(400).json({ error: 'A plan and term duration (1, 3, 6, or 12 months) are required' });
  }
  const months = Number(duration);

  try {
    const plan = await getPlanBySlug(planSlug);
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    const price = priceForDuration(plan, months);
    if (!price || price <= 0) {
      return res.status(400).json({ error: 'This term is not available for the selected plan' });
    }

    const tutor = await db.query.users.findFirst({ where: eq(users.id, tutorId) });
    if (!tutor) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // One live checkout per tutor: stale pending rows are failed so an
    // abandoned checkout can never be activated by a later payment.
    await db
      .update(tutorSubscriptions)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(tutorSubscriptions.tutorId, tutorId));

    const subscriptionId = `sub_${randomBytes(9).toString('hex')}`;
    const reference = `SUB-${Date.now()}-${randomBytes(4).toString('hex').toUpperCase()}`;

    await db.insert(tutorSubscriptions).values({
      id: subscriptionId,
      tutorId,
      planSlug: plan.slug,
      durationMonths: months,
      amountPaid: price.toString(),
      currency: plan.currency,
      planSnapshot: {
        name: plan.name,
        limits: plan.limits,
        features: plan.features,
      },
      status: 'pending',
      paystackReference: reference,
    });

    const data = await initializePaystackTransaction({
      email: tutor.email,
      amount: price,
      currency: plan.currency,
      reference,
      callback_url: `${process.env.FRONTEND_URL}/app/subscription/confirm`,
      metadata: {
        payment_for: 'tutor_subscription',
        subscription_id: subscriptionId,
        tutor_id: tutorId,
        plan_slug: plan.slug,
        duration_months: months,
      },
    });

    log.info({ tutorId, subscriptionId, planSlug, months, price, reference }, 'subscription.checkout_started');
    return res.json({ ...data, subscriptionId, reference, price, currency: plan.currency });
  } catch (err: any) {
    log.error({ err, tutorId, planSlug, months, providerError: err.response?.data }, 'subscription.checkout_failed');
    return res.status(500).json({ error: 'Payment initialization failed' });
  }
};

// ---------------------------------------------------------------------------
// GET /api/subscriptions/verify/:reference — Paystack return-route verification
// ---------------------------------------------------------------------------

export const verifySubscriptionPayment = async (req: Request, res: Response) => {
  const { reference } = req.params;
  const log = (req as any).log || logger;

  if (!PAYSTACK_SECRET) {
    return res.status(500).json({ error: 'Paystack not configured' });
  }

  try {
    const response = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
    });

    const data = response.data.data;
    if (data.status !== 'success') {
      log.warn({ reference, status: data.status }, 'subscription.verify_unsuccessful');
      return res.status(400).json({ error: 'Payment was not successful', payment: data });
    }

    const metadata = data.metadata || {};
    const settlement = await settleSubscriptionPayment({
      subscriptionId: metadata.subscription_id,
      paystackReference: data.reference || reference,
      paymentData: data,
      log,
    });

    if (!settlement.success) {
      return res.status(400).json({ error: settlement.error || 'Subscription activation failed' });
    }

    const tutorId = metadata.tutor_id;
    const subscription = tutorId ? await getEntitlements(tutorId) : null;
    return res.json({ verified: true, skipped: !!settlement.skipped, subscription });
  } catch (err: any) {
    log.error({ err, reference, providerError: err.response?.data }, 'subscription.verify_failed');
    return res.status(500).json({ error: 'Could not verify payment' });
  }
};

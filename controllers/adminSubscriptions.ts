import { Request, Response } from 'express';
import { and, eq, ilike, or, desc, sql } from 'drizzle-orm';
import { db } from '../database/db';
import {
  subscriptionPlans,
  teacherProfiles,
  transactions,
  tutorSubscriptions,
  users,
  type PlanFeatures,
  type PlanLimits,
} from '../database/schema';
import { SEARCH_RANK_BY_VISIBILITY, termEndFromNow } from '../services/subscriptionService';
import { createNotification } from './notificationController';
import logger from '../utils/logger';

interface AuthenticatedRequest extends Request {
  user?: { id: string; role?: string };
}

const SEARCH_VISIBILITIES: PlanFeatures['searchVisibility'][] = ['standard', 'improved', 'priority', 'premium'];
const SUPPORT_LEVELS: PlanFeatures['support'][] = ['standard', 'priority'];
const DURATION_MONTHS = [1, 3, 6, 12];

class ValidationError extends Error {}

const normalizeLimit = (value: unknown, field: string): number | 'unlimited' => {
  if (value === 'unlimited' || value === null) return 'unlimited';
  const num = Number(value);
  if (!Number.isInteger(num) || num < 1) {
    throw new ValidationError(`${field} must be a positive whole number or 'unlimited'`);
  }
  return num;
};

const normalizePrice = (value: unknown, field: string): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (!Number.isInteger(num) || num < 0) {
    throw new ValidationError(`${field} must be a non-negative whole number or null`);
  }
  return num;
};

// ---------------------------------------------------------------------------
// GET /api/admin/subscriptions/plans — full catalog including inactive
// ---------------------------------------------------------------------------

export const adminListPlans = async (_req: Request, res: Response) => {
  try {
    const plans = await db
      .select()
      .from(subscriptionPlans)
      .orderBy(subscriptionPlans.sortOrder);
    return res.json({ plans });
  } catch (err: any) {
    logger.error({ err }, 'admin.subscriptions_plans_failed');
    return res.status(500).json({ error: 'Failed to load plans' });
  }
};

// ---------------------------------------------------------------------------
// PUT /api/admin/subscriptions/plans/:slug
// Edits only affect FUTURE checkouts — tutors mid-term keep the limits and
// entitlements stored in their subscription's plan_snapshot.
// ---------------------------------------------------------------------------

export const adminUpdatePlan = async (req: AuthenticatedRequest, res: Response) => {
  const { slug } = req.params;
  const body = req.body || {};

  try {
    const [plan] = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.slug, slug))
      .limit(1);

    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    const updates: Partial<typeof subscriptionPlans.$inferInsert> = { updatedAt: new Date() };

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 100) {
        return res.status(400).json({ error: 'name must be 1-100 characters' });
      }
      updates.name = body.name.trim();
    }

    if (body.tagline !== undefined) {
      if (body.tagline !== null && (typeof body.tagline !== 'string' || body.tagline.length > 255)) {
        return res.status(400).json({ error: 'tagline must be at most 255 characters or null' });
      }
      updates.tagline = body.tagline === null ? null : body.tagline.trim();
    }

    if (body.sortOrder !== undefined) {
      const sortOrder = Number(body.sortOrder);
      if (!Number.isInteger(sortOrder) || sortOrder < 0) {
        return res.status(400).json({ error: 'sortOrder must be a non-negative whole number' });
      }
      updates.sortOrder = sortOrder;
    }

    if (body.isActive !== undefined) {
      updates.isActive = Boolean(body.isActive);
    }

    if (body.currency !== undefined) {
      // Currency stays NGN for now — prices and Paystack checkout assume it.
      if (body.currency !== 'NGN') {
        return res.status(400).json({ error: 'Only NGN is supported' });
      }
    }

    if (body.price1Month !== undefined || body.price3Months !== undefined
      || body.price6Months !== undefined || body.price12Months !== undefined) {
      try {
        if (body.price1Month !== undefined) updates.price1Month = normalizePrice(body.price1Month, 'price1Month');
        if (body.price3Months !== undefined) updates.price3Months = normalizePrice(body.price3Months, 'price3Months');
        if (body.price6Months !== undefined) updates.price6Months = normalizePrice(body.price6Months, 'price6Months');
        if (body.price12Months !== undefined) updates.price12Months = normalizePrice(body.price12Months, 'price12Months');
      } catch (e) {
        return res.status(400).json({ error: (e as Error).message });
      }
    }

    if (body.limits !== undefined || body.features !== undefined) {
      const currentLimits = plan.limits as PlanLimits;
      const currentFeatures = plan.features as PlanFeatures;

      let limits = currentLimits;
      if (body.limits !== undefined) {
        if (!body.limits || typeof body.limits !== 'object') {
          return res.status(400).json({ error: 'limits must be an object' });
        }
        try {
          limits = {
            activeCourses: body.limits.activeCourses !== undefined
              ? normalizeLimit(body.limits.activeCourses, 'activeCourses')
              : currentLimits.activeCourses,
            totalVideoMinutes: body.limits.totalVideoMinutes !== undefined
              ? normalizeLimit(body.limits.totalVideoMinutes, 'totalVideoMinutes')
              : currentLimits.totalVideoMinutes,
          };
        } catch (e) {
          return res.status(400).json({ error: (e as Error).message });
        }
      }

      let features = currentFeatures;
      if (body.features !== undefined) {
        if (!body.features || typeof body.features !== 'object') {
          return res.status(400).json({ error: 'features must be an object' });
        }
        features = {
          searchVisibility: body.features.searchVisibility !== undefined
            ? body.features.searchVisibility
            : currentFeatures.searchVisibility,
          featuredBadge: body.features.featuredBadge !== undefined
            ? Boolean(body.features.featuredBadge)
            : currentFeatures.featuredBadge,
          support: body.features.support !== undefined
            ? body.features.support
            : currentFeatures.support,
          dripContent: body.features.dripContent !== undefined
            ? Boolean(body.features.dripContent)
            : currentFeatures.dripContent,
        };
        if (!SEARCH_VISIBILITIES.includes(features.searchVisibility)) {
          return res.status(400).json({ error: 'searchVisibility must be standard, improved, priority, or premium' });
        }
        if (!SUPPORT_LEVELS.includes(features.support)) {
          return res.status(400).json({ error: 'support must be standard or priority' });
        }
      }

      updates.limits = limits;
      updates.features = features;
    }

    const [updated] = await db
      .update(subscriptionPlans)
      .set(updates)
      .where(eq(subscriptionPlans.slug, slug))
      .returning();

    logger.info({
      adminId: req.user?.id,
      slug,
      updates: Object.keys(updates),
    }, 'admin.subscription_plan_updated');

    return res.json({ plan: updated });
  } catch (err: any) {
    logger.error({ err, slug }, 'admin.subscription_plan_update_failed');
    return res.status(500).json({ error: 'Failed to update plan' });
  }
};

// ---------------------------------------------------------------------------
// GET /api/admin/subscriptions — all checkout/subscription rows
// Filters: status, plan, search (tutor name/email); paginated.
// ---------------------------------------------------------------------------

export const adminListSubscriptions = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = (page - 1) * limit;

    const conditions = [];

    const status = req.query.status as string | undefined;
    if (status && ['pending', 'active', 'expired', 'superseded', 'failed'].includes(status)) {
      conditions.push(eq(tutorSubscriptions.status, status));
    }

    const plan = req.query.plan as string | undefined;
    if (plan) {
      conditions.push(eq(tutorSubscriptions.planSlug, plan));
    }

    const search = (req.query.search as string | undefined)?.trim();
    if (search) {
      conditions.push(or(
        ilike(sql`CONCAT(${users.firstName}, ' ', ${users.lastName})`, `%${search}%`),
        ilike(users.email, `%${search}%`),
      )!);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, totalResult] = await Promise.all([
      db.select({
        id: tutorSubscriptions.id,
        tutorId: tutorSubscriptions.tutorId,
        tutorName: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
        tutorEmail: users.email,
        planSlug: tutorSubscriptions.planSlug,
        planSnapshot: tutorSubscriptions.planSnapshot,
        durationMonths: tutorSubscriptions.durationMonths,
        amountPaid: tutorSubscriptions.amountPaid,
        currency: tutorSubscriptions.currency,
        status: tutorSubscriptions.status,
        startsAt: tutorSubscriptions.startsAt,
        endsAt: tutorSubscriptions.endsAt,
        activatedAt: tutorSubscriptions.activatedAt,
        paystackReference: tutorSubscriptions.paystackReference,
        createdAt: tutorSubscriptions.createdAt,
      })
        .from(tutorSubscriptions)
        .innerJoin(users, eq(tutorSubscriptions.tutorId, users.id))
        .where(whereClause)
        .orderBy(desc(tutorSubscriptions.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` })
        .from(tutorSubscriptions)
        .innerJoin(users, eq(tutorSubscriptions.tutorId, users.id))
        .where(whereClause),
    ]);

    const total = totalResult[0]?.count || 0;

    return res.json({
      data: rows,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    logger.error({ err }, 'admin.subscriptions_list_failed');
    return res.status(500).json({ error: 'Failed to load subscriptions' });
  }
};

// ---------------------------------------------------------------------------
// POST /api/admin/subscriptions/grant
// Manual grant/override for support cases: activates a plan for a tutor with
// no payment. Supersedes active terms, updates search rank, never triggers a
// referral reward (rewards are for PAID subscriptions only).
// Body: { tutorId?, email?, plan, durationMonths }
// ---------------------------------------------------------------------------

export const adminGrantSubscription = async (req: AuthenticatedRequest, res: Response) => {
  const adminId = req.user?.id;
  const log = (req as any).log || logger;

  try {
    const { tutorId, email, plan: planSlug, durationMonths } = req.body || {};

    if (!planSlug || typeof planSlug !== 'string') {
      return res.status(400).json({ error: 'A plan slug is required' });
    }
    const months = Number(durationMonths);
    if (!DURATION_MONTHS.includes(months)) {
      return res.status(400).json({ error: 'durationMonths must be 1, 3, 6, or 12' });
    }

    const [plan] = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.slug, planSlug))
      .limit(1);

    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    let tutor = null;
    if (tutorId) {
      tutor = await db.query.users.findFirst({ where: eq(users.id, tutorId) });
    } else if (email) {
      tutor = await db.query.users.findFirst({ where: eq(users.email, String(email).toLowerCase().trim()) });
    }
    if (!tutor) {
      return res.status(404).json({ error: 'Tutor not found' });
    }
    if (tutor.role !== 'teacher') {
      return res.status(400).json({ error: 'Subscriptions can only be granted to tutors' });
    }

    const now = new Date();
    const endsAt = termEndFromNow(months);
    const subscriptionId = `sub_${Math.random().toString(36).substring(2, 15)}`;

    // Supersede any still-active terms — a grant takes effect immediately.
    await db
      .update(tutorSubscriptions)
      .set({ status: 'superseded', updatedAt: now })
      .where(and(
        eq(tutorSubscriptions.tutorId, tutor.id),
        eq(tutorSubscriptions.status, 'active'),
      ));

    await db.insert(tutorSubscriptions).values({
      id: subscriptionId,
      tutorId: tutor.id,
      planSlug: plan.slug,
      durationMonths: months,
      amountPaid: '0',
      currency: plan.currency,
      planSnapshot: {
        name: plan.name,
        limits: plan.limits as PlanLimits,
        features: plan.features as PlanFeatures,
      },
      status: 'active',
      startsAt: now,
      endsAt,
      activatedAt: now,
      paystackReference: null,
    });

    // Audit trail — amount 0, no Paystack reference, admin actor recorded.
    const transactionId = Math.random().toString(36).substring(2, 15);
    await db.insert(transactions).values({
      id: transactionId,
      teacherId: tutor.id,
      paystackReference: null,
      amount: '0',
      type: 'tutor_subscription_admin_grant',
      metadata: {
        subscriptionId,
        planSlug: plan.slug,
        durationMonths: months,
        grantedBy: adminId,
        grantedAt: now.toISOString(),
      },
    });

    await db
      .update(teacherProfiles)
      .set({
        searchRank: SEARCH_RANK_BY_VISIBILITY[(plan.features as PlanFeatures).searchVisibility] || 'normal',
        updatedAt: now,
      })
      .where(eq(teacherProfiles.userId, tutor.id));

    await createNotification({
      userId: tutor.id,
      type: 'subscription_activated',
      title: 'Subscription active',
      message: `An Eduwins admin activated your ${plan.name} plan (${months} month${months > 1 ? 's' : ''}). Enjoy!`,
    });

    log.info({ adminId, tutorId: tutor.id, subscriptionId, planSlug, months }, 'admin.subscription_granted');

    return res.json({
      subscriptionId,
      tutor: { id: tutor.id, name: `${tutor.firstName} ${tutor.lastName}`, email: tutor.email },
      plan: plan.name,
      durationMonths: months,
      endsAt,
    });
  } catch (err: any) {
    log.error({ err, adminId }, 'admin.subscription_grant_failed');
    return res.status(500).json({ error: 'Failed to grant subscription' });
  }
};

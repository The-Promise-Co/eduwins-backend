import { and, eq, gt, inArray, isNotNull, isNull, lte } from 'drizzle-orm';
import { db } from '../database/db';
import {
  subscriptionPlans,
  tutorSubscriptions,
  teacherProfiles,
  type PlanFeatures,
  type PlanLimits,
  type SubscriptionPlan,
  type TutorSubscription,
} from '../database/schema';
import { createNotification } from '../controllers/notificationController';
import logger from '../utils/logger';

// ---------------------------------------------------------------------------
// Free tier — the implicit default when no paid subscription is active.
// ---------------------------------------------------------------------------

export const FREE_PLAN_NAME = 'Free';

export const FREE_LIMITS: PlanLimits = {
  activeCourses: 2,
  totalVideoMinutes: 50,
};

export const FREE_FEATURES: PlanFeatures = {
  searchVisibility: 'standard',
  featuredBadge: false,
  support: 'standard',
  dripContent: false,
};

// ---------------------------------------------------------------------------
// Plan catalog — server-owned defaults. Seeded into subscription_plans on
// first use; the table then remains the authority so admins can adjust.
// ---------------------------------------------------------------------------

export type PlanSeed = {
  slug: 'silver' | 'gold' | 'platinum';
  name: string;
  tagline: string;
  sortOrder: number;
  price1Month: number;
  price3Months: number;
  price6Months: number;
  price12Months: number;
  limits: PlanLimits;
  features: PlanFeatures;
};

export const DEFAULT_PLANS: PlanSeed[] = [
  {
    slug: 'silver',
    name: 'Silver',
    tagline: 'For tutors building momentum',
    sortOrder: 1,
    price1Month: 9250,
    price3Months: 24975,   // 10% off 3 months
    price6Months: 41625,   // 25% off 6 months
    price12Months: 72150,  // 35% off 12 months
    limits: { activeCourses: 10, totalVideoMinutes: 300 },
    features: { searchVisibility: 'improved', featuredBadge: false, support: 'standard', dripContent: true },
  },
  {
    slug: 'gold',
    name: 'Gold',
    tagline: 'For tutors monetizing their content',
    sortOrder: 2,
    price1Month: 12750,
    price3Months: 34425,
    price6Months: 57375,
    price12Months: 99450,
    limits: { activeCourses: 'unlimited', totalVideoMinutes: 1000 },
    features: { searchVisibility: 'priority', featuredBadge: true, support: 'standard', dripContent: true },
  },
  {
    slug: 'platinum',
    name: 'Platinum',
    tagline: 'For established tutors scaling up',
    sortOrder: 3,
    price1Month: 15250,
    price3Months: 41175,
    price6Months: 68625,
    price12Months: 118950,
    limits: { activeCourses: 'unlimited', totalVideoMinutes: 'unlimited' },
    features: { searchVisibility: 'premium', featuredBadge: true, support: 'priority', dripContent: true },
  },
];

// The searchRank stored on teacher_profiles for each visibility level.
export const SEARCH_RANK_BY_VISIBILITY: Record<PlanFeatures['searchVisibility'], string> = {
  standard: 'normal',
  improved: 'improved',
  priority: 'priority',
  premium: 'premium',
};

let seedPromise: Promise<void> | null = null;

const seedPlans = async () => {
  for (const plan of DEFAULT_PLANS) {
    await db
      .insert(subscriptionPlans)
      .values({
        slug: plan.slug,
        name: plan.name,
        tagline: plan.tagline,
        sortOrder: plan.sortOrder,
        price1Month: plan.price1Month,
        price3Months: plan.price3Months,
        price6Months: plan.price6Months,
        price12Months: plan.price12Months,
        limits: plan.limits,
        features: plan.features,
      })
      .onConflictDoNothing(); // never overwrite live configuration
  }
};

/** Idempotent, single-flight plan seeding. */
export const ensurePlansSeeded = async () => {
  if (!seedPromise) {
    seedPromise = seedPlans().catch((err) => {
      seedPromise = null; // allow retry on next call
      throw err;
    });
  }
  return seedPromise;
};

// ---------------------------------------------------------------------------
// Entitlements
// ---------------------------------------------------------------------------

export type Entitlements = {
  plan: string;                 // 'Free' | plan display name
  planSlug: string | null;
  limits: PlanLimits;
  features: PlanFeatures;
  subscriptionEndsAt: string | null; // ISO date of current term end, if paid
};

/**
 * Flip ended subscription rows to 'expired', reset their tutors' search rank
 * to standard, and notify each tutor once (the flip itself is the dedup —
 * a row can only transition active→expired a single time).
 * Returns the expired rows so callers can log or report on them.
 */
const expireRows = async (
  stale: (typeof tutorSubscriptions.$inferSelect)[],
): Promise<void> => {
  if (stale.length === 0) return;

  const tutorIds = [...new Set(stale.map((row) => row.tutorId))];

  // Premium search rank ends with the term.
  await db
    .update(teacherProfiles)
    .set({ searchRank: SEARCH_RANK_BY_VISIBILITY.standard, updatedAt: new Date() })
    .where(inArray(teacherProfiles.userId, tutorIds));

  await Promise.all(
    stale.map((row) =>
      createNotification({
        userId: row.tutorId,
        type: 'subscription_expired',
        title: 'Subscription ended',
        message: `Your ${row.planSnapshot?.name || row.planSlug} plan has ended. You are now on the Free plan — your courses stay live, and you can renew any time.`,
      }).catch((err) => {
        // Notification failure must not block the expiry itself.
        logger.error({ err, subscriptionId: row.id }, 'subscription.expired_notification_failed');
      }),
    ),
  );

  logger.info(
    { expiredCount: stale.length, tutors: tutorIds.length },
    'subscription.expired_sweep',
  );
};

/** Lazy per-tutor sweep — runs whenever that tutor's entitlements are read. */
export const expireStaleSubscriptions = async (tutorId: string) => {
  const stale = await db
    .update(tutorSubscriptions)
    .set({ status: 'expired', updatedAt: new Date() })
    .where(
      and(
        eq(tutorSubscriptions.tutorId, tutorId),
        eq(tutorSubscriptions.status, 'active'),
        lte(tutorSubscriptions.endsAt, new Date()),
      ),
    )
    .returning();

  await expireRows(stale);
};

/**
 * Scheduled all-tutor sweep — the cron counterpart of the lazy sweep.
 * Closes the gap where a lapsed tutor who never visits their dashboard
 * would keep `active` status and a premium searchRank indefinitely.
 */
export const expireAllStaleSubscriptions = async () => {
  const stale = await db
    .update(tutorSubscriptions)
    .set({ status: 'expired', updatedAt: new Date() })
    .where(
      and(
        eq(tutorSubscriptions.status, 'active'),
        lte(tutorSubscriptions.endsAt, new Date()),
      ),
    )
    .returning();

  await expireRows(stale);
  return stale.length;
};

/**
 * T-7 renewal reminders — one in-app notification per subscription whose
 * term ends within the next 7 days. `renewal_reminder_sent_at` makes the
 * job idempotent: a row is never reminded twice.
 * Returns the number of reminders sent.
 */
export const sendDueRenewalReminders = async (): Promise<number> => {
  const now = new Date();
  const inSevenDays = new Date(now.getTime() + 7 * 86400000);

  const due = await db
    .select()
    .from(tutorSubscriptions)
    .where(
      and(
        eq(tutorSubscriptions.status, 'active'),
        isNotNull(tutorSubscriptions.endsAt),
        lte(tutorSubscriptions.endsAt, inSevenDays),
        gt(tutorSubscriptions.endsAt, now),
        isNull(tutorSubscriptions.renewalReminderSentAt),
      ),
    );

  for (const row of due) {
    const daysLeft = Math.max(
      1,
      Math.ceil((new Date(row.endsAt as Date).getTime() - now.getTime()) / 86400000),
    );
    const planName = row.planSnapshot?.name || row.planSlug;

    try {
      await createNotification({
        userId: row.tutorId,
        type: 'subscription_expiring',
        title: 'Subscription ending soon',
        message: `Your ${planName} plan ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}. Renew from your subscription page to keep your benefits.`,
      });
      await db
        .update(tutorSubscriptions)
        .set({ renewalReminderSentAt: now, updatedAt: now })
        .where(eq(tutorSubscriptions.id, row.id));
      logger.info({ subscriptionId: row.id, daysLeft }, 'subscription.renewal_reminder_sent');
    } catch (err) {
      // A failed reminder retries on the next job run (flag stays unset).
      logger.error({ err, subscriptionId: row.id }, 'subscription.renewal_reminder_failed');
    }
  }

  return due.length;
};

export const getActiveSubscription = async (tutorId: string): Promise<TutorSubscription | null> => {
  await expireStaleSubscriptions(tutorId);

  const [active] = await db
    .select()
    .from(tutorSubscriptions)
    .where(
      and(
        eq(tutorSubscriptions.tutorId, tutorId),
        eq(tutorSubscriptions.status, 'active'),
      ),
    )
    .orderBy(tutorSubscriptions.endsAt)
    .limit(1);

  if (!active) return null;
  if (active.endsAt && new Date(active.endsAt).getTime() <= Date.now()) return null;
  return active;
};

/** One call answers "what can this tutor do right now?" */
export const getEntitlements = async (tutorId: string): Promise<Entitlements> => {
  const active = await getActiveSubscription(tutorId);

  if (!active) {
    return {
      plan: FREE_PLAN_NAME,
      planSlug: null,
      limits: FREE_LIMITS,
      features: FREE_FEATURES,
      subscriptionEndsAt: null,
    };
  }

  const snapshot = active.planSnapshot;
  return {
    plan: snapshot?.name || active.planSlug,
    planSlug: active.planSlug,
    limits: snapshot?.limits || FREE_LIMITS,
    features: snapshot?.features || FREE_FEATURES,
    subscriptionEndsAt: active.endsAt ? new Date(active.endsAt).toISOString() : null,
  };
};

// ---------------------------------------------------------------------------
// Plan helpers
// ---------------------------------------------------------------------------

export const getPlanBySlug = async (slug: string): Promise<SubscriptionPlan | null> => {
  await ensurePlansSeeded();
  const [plan] = await db
    .select()
    .from(subscriptionPlans)
    .where(and(eq(subscriptionPlans.slug, slug), eq(subscriptionPlans.isActive, true)))
    .limit(1);
  return plan || null;
};

export const listActivePlans = async (): Promise<SubscriptionPlan[]> => {
  await ensurePlansSeeded();
  return db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.isActive, true))
    .orderBy(subscriptionPlans.sortOrder);
};

export const DURATION_MONTHS = [1, 3, 6, 12] as const;
export type DurationMonths = (typeof DURATION_MONTHS)[number];

export const priceForDuration = (plan: SubscriptionPlan, months: number): number | null => {
  switch (months) {
    case 1: return plan.price1Month;
    case 3: return plan.price3Months;
    case 6: return plan.price6Months;
    case 12: return plan.price12Months;
    default: return null;
  }
};

export const termEndFromNow = (months: number): Date => {
  const end = new Date();
  end.setMonth(end.getMonth() + months);
  return end;
};

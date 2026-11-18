import {
  pgTable,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  decimal,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { InferSelectModel } from 'drizzle-orm';
import { users } from './users';

/**
 * Subscription tiers are server-owned configuration. Prices, limits, and
 * entitlements are never accepted from the browser — the plan catalog below
 * is the single source of truth for what a tier costs and what it grants.
 *
 * Tiers: free (implicit, no row needed) | silver | gold | platinum.
 * Durations: prepaid fixed terms of 1, 3, 6, or 12 months. Auto-renewal is
 * deferred but the schema leaves room for it (see status values + fields).
 */

export type PlanLimits = {
  activeCourses: number | 'unlimited';
  totalVideoMinutes: number | 'unlimited';
};

export type PlanFeatures = {
  searchVisibility: 'standard' | 'improved' | 'priority' | 'premium';
  featuredBadge: boolean;
  support: 'standard' | 'priority';
  dripContent: boolean;
};

export const subscriptionPlans = pgTable('subscription_plans', {
  // Stable slug used by the API: 'silver' | 'gold' | 'platinum'
  slug: varchar('slug', { length: 50 }).primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  tagline: varchar('tagline', { length: 255 }),
  sortOrder: integer('sort_order').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),

  currency: varchar('currency', { length: 10 }).default('NGN').notNull(),

  // Total price for each prepaid term (₦). Null = term not offered.
  price1Month: integer('price_1_month'),
  price3Months: integer('price_3_months'),
  price6Months: integer('price_6_months'),
  price12Months: integer('price_12_months'),

  limits: jsonb('limits').$type<PlanLimits>().notNull(),
  features: jsonb('features').$type<PlanFeatures>().notNull(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * tutor_subscriptions — one row per checkout attempt.
 * 'pending' rows are created at checkout and activated only after Paystack
 * verification confirms charge.success. Reference is unique so callback and
 * webhook retries can never grant duplicate access.
 */
export const tutorSubscriptions = pgTable('tutor_subscriptions', {
  id: varchar('id', { length: 255 }).primaryKey(),
  tutorId: varchar('tutor_id', { length: 255 })
    .notNull()
    .references(() => users.id),

  // Plan + term chosen at checkout. The plan snapshot preserves the limits
  // and entitlements the tutor paid for, even if the catalog changes later.
  planSlug: varchar('plan_slug', { length: 50 }).notNull(),
  durationMonths: integer('duration_months').notNull(),
  amountPaid: decimal('amount_paid', { precision: 20, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 10 }).default('NGN').notNull(),
  planSnapshot: jsonb('plan_snapshot').$type<{
    name: string;
    limits: PlanLimits;
    features: PlanFeatures;
  }>(),

  // 'pending' | 'active' | 'expired' | 'superseded' | 'failed'
  status: varchar('status', { length: 50 }).default('pending').notNull(),

  startsAt: timestamp('starts_at'),
  endsAt: timestamp('ends_at'),
  activatedAt: timestamp('activated_at'),

  paystackReference: varchar('paystack_reference', { length: 255 }).unique(),

  // Referral reward handling — credited at most once, on first activation.
  referralRewarded: boolean('referral_rewarded').default(false).notNull(),

  // Renewal reminder — set when the T-7 "term ending soon" notification has
  // been sent for this row, so the reminder job never notifies twice.
  renewalReminderSentAt: timestamp('renewal_reminder_sent_at'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  tutorIdx: index('tutor_subscriptions_tutor_idx').on(t.tutorId),
  statusIdx: index('tutor_subscriptions_status_idx').on(t.status),
}));

export type SubscriptionPlan = InferSelectModel<typeof subscriptionPlans>;
export type TutorSubscription = InferSelectModel<typeof tutorSubscriptions>;

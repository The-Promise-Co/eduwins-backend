import {
  pgTable,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  decimal,
  jsonb,
} from 'drizzle-orm/pg-core';
import { InferSelectModel } from 'drizzle-orm';
import { users } from './users';
import { bookings } from './lessons';

export const withdrawals = pgTable('withdrawals', {
  id: varchar('id', { length: 255 }).primaryKey(),
  teacherId: varchar('teacher_id', { length: 255 }).references(() => users.id),
  amount: decimal('amount', { precision: 20, scale: 2 }).notNull(),
  netAmount: decimal('net_amount', { precision: 20, scale: 2 }),
  processingFee: decimal('processing_fee', { precision: 20, scale: 2 }),
  bankCode: varchar('bank_code', { length: 50 }),
  accountNumber: varchar('account_number', { length: 50 }),
  accountName: varchar('account_name', { length: 255 }),
  narration: text('narration'),
  status: varchar('status', { length: 50 }).default('pending'), // 'pending', 'processing', 'completed', 'failed', 'cancelled'
  paystackReference: varchar('paystack_reference', { length: 255 }),
  failureReason: text('failure_reason'),
  month: varchar('month', { length: 7 }), // YYYY-MM
  createdAt: timestamp('created_at').defaultNow(),
  completedAt: timestamp('completed_at'),
  cancelledAt: timestamp('cancelled_at'),
});

export const earnings = pgTable('earnings', {
  id: varchar('id', { length: 255 }).primaryKey(),
  teacherId: varchar('teacher_id', { length: 255 }).references(() => users.id),
  total: decimal('total', { precision: 20, scale: 2 }).default('0'),
  acquiredFromLessons: decimal('acquired_from_lessons', { precision: 20, scale: 2 }).default('0'),
  acquiredFromVault: decimal('acquired_from_vault', { precision: 20, scale: 2 }).default('0'),
  acquiredFromReferrals: decimal('acquired_from_referrals', { precision: 20, scale: 2 }).default('0'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const transactions = pgTable('transactions', {
  id: varchar('id', { length: 255 }).primaryKey(),
  bookingId: varchar('booking_id', { length: 255 }).references(() => bookings.id),
  teacherId: varchar('teacher_id', { length: 255 }).references(() => users.id),
  amount: decimal('amount', { precision: 20, scale: 2 }).notNull(),
  type: varchar('type', { length: 50 }).notNull(), // 'payment_in', 'withdrawal_out', 'vault_purchase', etc.
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const ambassadors = pgTable('ambassadors', {
  userId: varchar('user_id', { length: 255 }).primaryKey().references(() => users.id),
  mentorId: varchar('mentor_id', { length: 255 }),
  level: integer('level').default(1),
  status: varchar('status', { length: 50 }).default('active'),
  directReferrals: integer('direct_referrals').default(0),
  indirectReferrals: integer('indirect_referrals').default(0),
  earnedCredits: decimal('earned_credits', { precision: 20, scale: 2 }).default('0'),
  createdAt: timestamp('created_at').defaultNow(),
});

/**
 * referrals
 * One row per (referrer → referee) relationship.
 * Created at referee email verification (status='pending').
 * Updated to 'subscribed' and rewardCredited=true when the referee's
 * first subscription is confirmed — at that point subscriptionPlan,
 * subscriptionPrice, and rewardAmount are filled in.
 */
export const referrals = pgTable('referrals', {
  id: varchar('id', { length: 255 }).primaryKey(),
  referrerId: varchar('referrer_id', { length: 255 }).notNull().references(() => users.id),
  refereeId: varchar('referee_id', { length: 255 }).notNull().references(() => users.id),

  // Set when the referee subscribes for the first time
  subscriptionPlan: varchar('subscription_plan', { length: 50 }),   // 'monthly' | 'quarterly' | 'annual'
  subscriptionPrice: decimal('subscription_price', { precision: 20, scale: 2 }),
  rewardAmount: decimal('reward_amount', { precision: 20, scale: 2 }),

  // Lifecycle
  status: varchar('status', { length: 50 }).default('pending').notNull(), // 'pending' | 'subscribed'
  rewardCredited: boolean('reward_credited').default(false).notNull(),

  createdAt: timestamp('created_at').defaultNow(),   // when referee signed up
  rewardedAt: timestamp('rewarded_at'),              // when reward was actually applied
});

export const progressReports = pgTable('progress_reports', {
  id: varchar('id', { length: 255 }).primaryKey(),
  studentId: varchar('student_id', { length: 255 }).references(() => users.id),
  teacherId: varchar('teacher_id', { length: 255 }).references(() => users.id),
  bookingId: varchar('booking_id', { length: 255 }).references(() => bookings.id),
  reportData: jsonb('report_data'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const notifications = pgTable('notifications', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: varchar('user_id', { length: 255 }).references(() => users.id),
  type: varchar('type', { length: 100 }),
  title: varchar('title', { length: 255 }),
  message: text('message'),
  read: boolean('read').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

export type Withdrawal = InferSelectModel<typeof withdrawals>;
export type Transaction = InferSelectModel<typeof transactions>;
export type Ambassador = InferSelectModel<typeof ambassadors>;
export type Notification = InferSelectModel<typeof notifications>;
export type Referral = InferSelectModel<typeof referrals>;

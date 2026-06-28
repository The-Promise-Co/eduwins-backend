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
  paystackReference: varchar('paystack_reference', { length: 255 }).unique(),
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
  paystackReference: varchar('paystack_reference', { length: 255 }).unique(),
  amount: decimal('amount', { precision: 20, scale: 2 }).notNull(),
  type: varchar('type', { length: 50 }).notNull(), // 'payment_in', 'withdrawal_out', 'vault_purchase', etc.
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const digitalVault = pgTable('digital_vault', {
  id: varchar('id', { length: 255 }).primaryKey(),
  teacherId: varchar('teacher_id', { length: 255 }).references(() => users.id),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  subject: varchar('subject', { length: 255 }),
  contentType: varchar('content_type', { length: 50 }),
  price: decimal('price', { precision: 20, scale: 2 }).notNull(),
  fileUrl: text('file_url'),
  previewUrl: text('preview_url'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const vaultPurchases = pgTable('vault_purchases', {
  id: varchar('id', { length: 255 }).primaryKey(),
  itemId: varchar('item_id', { length: 255 }).references(() => digitalVault.id),
  buyerId: varchar('buyer_id', { length: 255 }).references(() => users.id),
  pricePaid: decimal('price_paid', { precision: 20, scale: 2 }),
  purchaseDate: timestamp('purchase_date').defaultNow(),
});

export const welfareFunds = pgTable('welfare_funds', {
  id: varchar('id', { length: 255 }).primaryKey(),
  teacherId: varchar('teacher_id', { length: 255 }).references(() => users.id),
  month: varchar('month', { length: 7 }),
  amount: decimal('amount', { precision: 20, scale: 2 }),
  lessonCount: integer('lesson_count').default(0),
  status: varchar('status', { length: 50 }).default('locked'),
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
export type Notification = InferSelectModel<typeof notifications>;
export type Referral = InferSelectModel<typeof referrals>;

import {
  pgTable,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  decimal,
} from 'drizzle-orm/pg-core';
import { InferSelectModel, InferInsertModel } from 'drizzle-orm';

export const users = pgTable('users', {
  id: varchar('id', { length: 255 }).primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  phone: varchar('phone', { length: 50 }).unique(),
  passwordHash: text('password_hash'),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull(), // 'teacher', 'parent', 'admin'
  isVerified: boolean('is_verified').default(false),
  trustScore: integer('trust_score').default(0),
  referralCode: varchar('referral_code', { length: 50 }).unique(),
  referralCount: integer('referral_count').default(0),
  referredBy: varchar('referred_by', { length: 255 }),
  referralRewarded: boolean('referral_rewarded').default(false),
  photoUrl: text('photo_url'),
  bio: text('bio'),

  // Housing Flags
  housingEligible: boolean('housing_eligible').default(false),
  housingStatus: varchar('housing_status', { length: 50 }).default('not-started'), // 'not-started', 'rent-to-own', 'homeowner'
  hasActiveMortgage: boolean('has_active_mortgage').default(false),
  activeMortgageId: varchar('active_mortgage_id', { length: 255 }),
  propertyOwned: boolean('property_owned').default(false),
  
  // Premium Flags
  isPremium: boolean('is_premium').default(false),
  subscriptionActive: boolean('subscription_active').default(false),
  subscriptionId: varchar('subscription_id', { length: 255 }),
  subscriptionPlan: varchar('subscription_plan', { length: 50 }),
  subscriptionEndDate: timestamp('subscription_end_date'),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const teacherProfiles = pgTable('teacher_profiles', {
  userId: varchar('user_id', { length: 255 }).primaryKey().references(() => users.id),
  baseHourlyRate: decimal('base_hourly_rate', { precision: 20, scale: 2 }).default('0'),
  totalEarnings: decimal('total_earnings', { precision: 20, scale: 2 }).default('0'),
  walletBalance: decimal('wallet_balance', { precision: 20, scale: 2 }).default('0'),
  welfareBalance: decimal('welfare_balance', { precision: 20, scale: 2 }).default('0'),
  referralWelfareBoost: decimal('referral_welfare_boost', { precision: 20, scale: 2 }).default('0'),
  ratingAvg: decimal('rating_avg', { precision: 3, scale: 2 }).default('0'),
  totalSessions: integer('total_sessions').default(0),
  isApproved: boolean('is_approved').default(false),
  searchRank: varchar('search_rank', { length: 50 }).default('normal'),
  photoUrl: text('photo_url'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const parentProfiles = pgTable('parent_profiles', {
  userId: varchar('user_id', { length: 255 }).primaryKey().references(() => users.id),
  defaultLocationLga: varchar('default_location_lga', { length: 255 }),
  referralDiscount: decimal('referral_discount', { precision: 20, scale: 2 }).default('0'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const otps = pgTable('otps', {
  phone: varchar('phone', { length: 50 }).primaryKey(),
  otp: varchar('otp', { length: 10 }).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
export type TeacherProfile = InferSelectModel<typeof teacherProfiles>;
export type ParentProfile = InferSelectModel<typeof parentProfiles>;

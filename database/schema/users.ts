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
  firstName: varchar('first_name', { length: 255 }).notNull(),
  lastName: varchar('last_name', { length: 255 }).notNull(),
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

  // 2FA Flags
  twoFactorEnabled: boolean('two_factor_enabled').default(false),
  twoFactorSecret: text('two_factor_secret'),
  twoFactorTempSecret: text('two_factor_temp_secret'),

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

/**
 * verification_tokens
 * Looked up by token to validate the OTP the user entered.
 * type supports future contexts: 'register' | 'login' | 'payment' | 'password_reset'
 */
export const verificationTokens = pgTable('verification_tokens', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: varchar('token', { length: 255 }).notNull().unique(),  // returned to frontend, stored in sessionStorage
  otp: varchar('otp', { length: 10 }).notNull(),           // 6-digit code sent via email
  type: varchar('type', { length: 50 }).notNull(),           // 'register' | 'login' | 'payment' | 'password_reset'
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),                                    // null = not yet consumed
  createdAt: timestamp('created_at').defaultNow(),
});


export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
export type ParentProfile = InferSelectModel<typeof parentProfiles>;
export type VerificationToken = InferSelectModel<typeof verificationTokens>;


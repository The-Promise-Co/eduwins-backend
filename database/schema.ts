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
import { InferSelectModel, InferInsertModel } from 'drizzle-orm';

// ==================== USERS & PROFILES ====================

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
  averageMonthlyEarnings: decimal('average_monthly_earnings', { precision: 20, scale: 2 }).default('0'),
  
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

// ==================== LESSONS & BOOKINGS ====================

export const bookings = pgTable('bookings', {
  id: varchar('id', { length: 255 }).primaryKey(),
  parentId: varchar('parent_id', { length: 255 }).references(() => users.id),
  teacherId: varchar('teacher_id', { length: 255 }).references(() => users.id),
  childId: varchar('child_id', { length: 255 }),
  subject: varchar('subject', { length: 255 }),
  status: varchar('status', { length: 50 }).default('pending'), // 'pending', 'paid_escrow', 'completed', 'cancelled'
  paymentReference: varchar('payment_reference', { length: 255 }),
  totalAmount: decimal('total_amount', { precision: 20, scale: 2 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const lessons = pgTable('lessons', {
  id: varchar('id', { length: 255 }).primaryKey(),
  bookingId: varchar('booking_id', { length: 255 }).references(() => bookings.id),
  subject: varchar('subject', { length: 255 }),
  scheduledTime: timestamp('scheduled_time'),
  status: varchar('status', { length: 50 }).default('scheduled'), // 'scheduled', 'completed_by_teacher', 'confirmed_by_parent'
  confirmationOtp: varchar('confirmation_otp', { length: 10 }),
  otpExpiry: timestamp('otp_expiry'),
  confirmedAt: timestamp('confirmed_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ==================== HOUSING SYSTEM ====================

export const housingEligibility = pgTable('housing_eligibility', {
  id: varchar('id', { length: 255 }).primaryKey(),
  teacherId: varchar('teacher_id', { length: 255 }).references(() => users.id),
  eligible: boolean('eligible').default(false),
  reason: text('reason'),
  details: jsonb('details'),
  checkedAt: timestamp('checked_at').defaultNow(),
  lastUpdated: timestamp('last_updated').defaultNow(),
});

export const housingMilestones = pgTable('housing_milestones', {
  id: varchar('id', { length: 255 }).primaryKey(),
  teacherId: varchar('teacher_id', { length: 255 }).references(() => users.id),
  milestoneType: varchar('milestone_type', { length: 100 }), // e.g., 'welfare_fund_500k'
  amount: decimal('amount', { precision: 20, scale: 2 }),
  achievedAt: timestamp('achieved_at').defaultNow(),
  status: varchar('status', { length: 50 }).default('completed'),
});

export const partnerships = pgTable('partnerships', {
  id: varchar('id', { length: 255 }).primaryKey(),
  partnerType: varchar('partner_type', { length: 50 }), // 'developer', 'fmbn', 'financial_institution'
  organizationName: varchar('organization_name', { length: 255 }).notNull(),
  contactPerson: varchar('contact_person', { length: 255 }),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  terms: jsonb('terms'),
  status: varchar('status', { length: 50 }).default('active'),
  activeSince: timestamp('active_since'),
  propertiesCount: integer('properties_count').default(0),
  applicationsProcessed: integer('applications_processed').default(0),
});

export const propertyGroups = pgTable('property_groups', {
  id: varchar('id', { length: 255 }).primaryKey(),
  partnershipId: varchar('partnership_id', { length: 255 }).references(() => partnerships.id),
  address: text('address'),
  city: varchar('city', { length: 100 }),
  state: varchar('state', { length: 100 }),
  price: decimal('price', { precision: 20, scale: 2 }),
  bedrooms: integer('bedrooms'),
  bathrooms: integer('bathrooms'),
  squareFeet: integer('square_feet'),
  description: text('description'),
  totalUnits: integer('total_units'),
  occupiedUnits: integer('occupied_units').default(0),
  status: varchar('status', { length: 50 }).default('active'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const housingProperties = pgTable('housing_properties', {
  id: varchar('id', { length: 255 }).primaryKey(),
  propertyGroupId: varchar('property_group_id', { length: 255 }).references(() => propertyGroups.id),
  partnershipId: varchar('partnership_id', { length: 255 }).references(() => partnerships.id),
  address: text('address'),
  city: varchar('city', { length: 100 }),
  state: varchar('state', { length: 100 }),
  price: decimal('price', { precision: 20, scale: 2 }),
  bedrooms: integer('bedrooms'),
  bathrooms: integer('bathrooms'),
  squareFeet: integer('square_feet'),
  description: text('description'),
  unitNumber: integer('unit_number'),
  status: varchar('status', { length: 50 }).default('available'), // 'available', 'occupied', 'reserved'
  occupiedBy: varchar('occupied_by', { length: 255 }).references(() => users.id),
  occupiedSince: timestamp('occupied_since'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const housingApplications = pgTable('housing_applications', {
  id: varchar('id', { length: 255 }).primaryKey(),
  teacherId: varchar('teacher_id', { length: 255 }).references(() => users.id),
  propertyId: varchar('property_id', { length: 255 }).references(() => housingProperties.id),
  mortgageId: varchar('mortgage_id', { length: 255 }),
  status: varchar('status', { length: 50 }).default('pending'), // 'pending', 'approved', 'rejected'
  propertyDetails: jsonb('property_details'),
  mortgageDetails: jsonb('mortgage_details'),
  appliedAt: timestamp('applied_at').defaultNow(),
  approvedAt: timestamp('approved_at'),
  rejectedAt: timestamp('rejected_at'),
  rejectionReason: text('rejection_reason'),
});

export const mortgages = pgTable('mortgages', {
  id: varchar('id', { length: 255 }).primaryKey(),
  teacherId: varchar('teacher_id', { length: 255 }).references(() => users.id),
  propertyId: varchar('property_id', { length: 255 }).references(() => housingProperties.id),
  propertyPrice: decimal('property_price', { precision: 20, scale: 2 }),
  downPayment: decimal('down_payment', { precision: 20, scale: 2 }),
  principal: decimal('principal', { precision: 20, scale: 2 }),
  loanTerm: integer('loan_term'), // In years
  interestRate: decimal('interest_rate', { precision: 5, scale: 2 }),
  monthlyPayment: decimal('monthly_payment', { precision: 20, scale: 2 }),
  monthlyIncome: decimal('monthly_income', { precision: 20, scale: 2 }),
  debtToIncomeRatio: decimal('debt_to_income_ratio', { precision: 5, scale: 2 }),
  status: varchar('status', { length: 50 }).default('active'), // 'active', 'completed', 'cancelled'
  totalPaid: decimal('total_paid', { precision: 20, scale: 2 }).default('0'),
  paymentsCompleted: integer('payments_completed').default(0),
  paymentsMissed: integer('payments_missed').default(0),
  remainingBalance: decimal('remaining_balance', { precision: 20, scale: 2 }),
  startDate: timestamp('start_date'),
  endDate: timestamp('end_date'),
  nextPaymentDue: timestamp('next_payment_due'),
  lastPaymentDate: timestamp('last_payment_date'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const mortgagePayments = pgTable('mortgage_payments', {
  id: varchar('id', { length: 255 }).primaryKey(),
  teacherId: varchar('teacher_id', { length: 255 }).references(() => users.id),
  mortgageId: varchar('mortgage_id', { length: 255 }).references(() => mortgages.id),
  amount: decimal('amount', { precision: 20, scale: 2 }),
  principalPaydown: decimal('principal_paydown', { precision: 20, scale: 2 }),
  interestPaid: decimal('interest_paid', { precision: 20, scale: 2 }),
  paymentDate: timestamp('payment_date').defaultNow(),
  status: varchar('status', { length: 50 }).default('completed'),
});

export const missedPayments = pgTable('missed_payments', {
  id: varchar('id', { length: 255 }).primaryKey(),
  teacherId: varchar('teacher_id', { length: 255 }).references(() => users.id),
  mortgageId: varchar('mortgage_id', { length: 255 }).references(() => mortgages.id),
  dueAmount: decimal('due_amount', { precision: 20, scale: 2 }),
  availableAmount: decimal('available_amount', { precision: 20, scale: 2 }),
  dueDate: timestamp('due_date').notNull(),
  status: varchar('status', { length: 50 }).default('missed'),
  rescheduledFor: timestamp('rescheduled_for'),
});

export const welfareFunds = pgTable('welfare_funds', {
  id: varchar('id', { length: 255 }).primaryKey(),
  teacherId: varchar('teacher_id', { length: 255 }).references(() => users.id),
  month: varchar('month', { length: 7 }), // YYYY-MM
  amount: decimal('amount', { precision: 20, scale: 2 }),
  lessonCount: integer('lesson_count').default(0),
  status: varchar('status', { length: 50 }).default('locked'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ==================== PREMIUM CONTENT & MARKETPLACE ====================

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

export const subscriptions = pgTable('subscriptions', {
  id: varchar('id', { length: 255 }).primaryKey(),
  teacherId: varchar('teacher_id', { length: 255 }).references(() => users.id),
  plan: varchar('plan', { length: 50 }).notNull(), // 'monthly', 'quarterly', 'annual'
  price: decimal('price', { precision: 20, scale: 2 }),
  duration: integer('duration'), // In days
  status: varchar('status', { length: 50 }).default('active'),
  paymentMethodId: varchar('payment_method_id', { length: 255 }),
  startDate: timestamp('start_date').defaultNow(),
  endDate: timestamp('end_date'),
  autoRenew: boolean('auto_renew').default(true),
  cancellationRequestedAt: timestamp('cancellation_requested_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const subjectVideos = pgTable('subject_videos', {
  id: varchar('id', { length: 255 }).primaryKey(),
  teacherId: varchar('teacher_id', { length: 255 }).references(() => users.id),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  subject: varchar('subject', { length: 255 }),
  videoUrl: text('video_url'),
  thumbnailUrl: text('thumbnail_url'),
  price: decimal('price', { precision: 20, scale: 2 }).default('0'),
  subscribers: jsonb('subscribers'), // Array of user IDs
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const teachingMaterials = pgTable('teaching_materials', {
  id: varchar('id', { length: 255 }).primaryKey(),
  teacherId: varchar('teacher_id', { length: 255 }).references(() => users.id),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  subject: varchar('subject', { length: 255 }),
  materialUrl: text('material_url'),
  contentType: varchar('content_type', { length: 50 }),
  price: decimal('price', { precision: 20, scale: 2 }).default('0'),
  downloads: integer('downloads').default(0),
  purchasers: jsonb('purchasers'), // Array of user IDs
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const videoAccess = pgTable('video_access', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: varchar('user_id', { length: 255 }).references(() => users.id),
  videoId: varchar('video_id', { length: 255 }).references(() => subjectVideos.id),
  teacherId: varchar('teacher_id', { length: 255 }).references(() => users.id),
  price: decimal('price', { precision: 20, scale: 2 }),
  transactionId: varchar('transaction_id', { length: 255 }),
  accessGrantedAt: timestamp('access_granted_at').defaultNow(),
  expiresAt: timestamp('expires_at'),
});

export const materialPurchases = pgTable('material_purchases', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: varchar('user_id', { length: 255 }).references(() => users.id),
  materialId: varchar('material_id', { length: 255 }).references(() => teachingMaterials.id),
  teacherId: varchar('teacher_id', { length: 255 }).references(() => users.id),
  price: decimal('price', { precision: 20, scale: 2 }),
  transactionId: varchar('transaction_id', { length: 255 }),
  purchasedAt: timestamp('purchased_at').defaultNow(),
});

// ==================== FINANCIALS & REWARDS ====================

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

// Types
export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
export type TeacherProfile = InferSelectModel<typeof teacherProfiles>;
export type ParentProfile = InferSelectModel<typeof parentProfiles>;
export type Booking = InferSelectModel<typeof bookings>;
export type Lesson = InferSelectModel<typeof lessons>;
export type HousingEligibility = InferSelectModel<typeof housingEligibility>;
export type Mortgage = InferSelectModel<typeof mortgages>;
export type WelfareFund = InferSelectModel<typeof welfareFunds>;
export type Withdrawal = InferSelectModel<typeof withdrawals>;
export type Transaction = InferSelectModel<typeof transactions>;
export type Ambassador = InferSelectModel<typeof ambassadors>;
export type Notification = InferSelectModel<typeof notifications>;

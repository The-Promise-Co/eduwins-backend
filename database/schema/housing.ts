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

export type HousingEligibility = InferSelectModel<typeof housingEligibility>;
export type Mortgage = InferSelectModel<typeof mortgages>;
export type WelfareFund = InferSelectModel<typeof welfareFunds>;

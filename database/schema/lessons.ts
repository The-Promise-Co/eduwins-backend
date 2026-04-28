import {
  pgTable,
  varchar,
  timestamp,
  decimal,
} from 'drizzle-orm/pg-core';
import { InferSelectModel } from 'drizzle-orm';
import { users } from './users';

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

export type Booking = InferSelectModel<typeof bookings>;
export type Lesson = InferSelectModel<typeof lessons>;

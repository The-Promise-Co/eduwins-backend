import {
  pgTable,
  varchar,
  timestamp,
  decimal,
  date,
  text,
} from 'drizzle-orm/pg-core';
import { InferSelectModel } from 'drizzle-orm';
import { users } from './users';
import { children } from './children';

export const bookings = pgTable('bookings', {
  id: varchar('id', { length: 255 }).primaryKey(),
  parentId: varchar('parent_id', { length: 255 }).references(() => users.id),
  teacherId: varchar('teacher_id', { length: 255 }).references(() => users.id),
  childId: varchar('child_id', { length: 255 }),
  subject: varchar('subject', { length: 255 }),
  status: varchar('status', { length: 50 }).default('pending'), // 'pending', 'paid_escrow', 'completed', 'cancelled'
  bookingFor: varchar('booking_for', { length: 50 }).default('self'),
  scheduledDate: date('scheduled_date'),
  startTime: varchar('start_time', { length: 5 }),
  endTime: varchar('end_time', { length: 5 }),
  durationHours: decimal('duration_hours', { precision: 6, scale: 2 }),
  note: text('note'),
  paymentReference: varchar('payment_reference', { length: 255 }),
  totalAmount: decimal('total_amount', { precision: 20, scale: 2 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const bookingChildren = pgTable('booking_children', {
  id: varchar('id', { length: 255 }).primaryKey(),
  bookingId: varchar('booking_id', { length: 255 }).notNull().references(() => bookings.id, { onDelete: 'cascade' }),
  childId: varchar('child_id', { length: 255 }).notNull().references(() => children.id, { onDelete: 'cascade' }),
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
export type BookingChild = InferSelectModel<typeof bookingChildren>;
export type Lesson = InferSelectModel<typeof lessons>;

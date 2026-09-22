import {
  pgTable,
  varchar,
  timestamp,
  boolean,
  text,
} from 'drizzle-orm/pg-core';
import { InferSelectModel } from 'drizzle-orm';
import { bookings } from './lessons';
import { children } from './children';

export const sessionJoinCodes = pgTable('session_join_codes', {
  id: varchar('id', { length: 255 }).primaryKey(),
  bookingId: varchar('booking_id', { length: 255 }).notNull().references(() => bookings.id, { onDelete: 'cascade' }),
  childId: varchar('child_id', { length: 255 }).notNull().references(() => children.id, { onDelete: 'cascade' }),
  code: varchar('code', { length: 20 }).notNull().unique(),
  used: boolean('used').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

export const sessionEvents = pgTable('session_events', {
  id: varchar('id', { length: 255 }).primaryKey(),
  bookingId: varchar('booking_id', { length: 255 }).notNull().references(() => bookings.id, { onDelete: 'cascade' }),
  participantIdentity: varchar('participant_identity', { length: 255 }),
  participantName: varchar('participant_name', { length: 255 }),
  participantRole: varchar('participant_role', { length: 50 }),
  childId: varchar('child_id', { length: 255 }),
  event: varchar('event', { length: 50 }),
  timestamp: timestamp('timestamp').defaultNow(),
});

/**
 * User-created whiteboard snapshots — the ONLY persisted whiteboard artifact.
 * Live board state is never stored (in-memory Yjs during the session only).
 * Image previews live on R2; only the public URL is stored here.
 */
export const whiteboardSnapshots = pgTable('whiteboard_snapshots', {
  id: varchar('id', { length: 255 }).primaryKey(),
  bookingId: varchar('booking_id', { length: 255 }).notNull().references(() => bookings.id, { onDelete: 'cascade' }),
  createdBy: varchar('created_by', { length: 255 }),
  title: varchar('title', { length: 255 }),
  scene: text('scene').notNull(),
  imageUrl: text('image_url'),
  authorName: varchar('author_name', { length: 255 }),
  authorRole: varchar('author_role', { length: 50 }),
  createdAt: timestamp('created_at').defaultNow(),
});

/**
 * Session sticky notes — one row per note (client-generated id for idempotent
 * retries). `kind` is 'personal' (private to `ownerId`) or 'shared' (visible
 * to every participant in the booking). `ownerId` is the author's user id for
 * JWT participants or the child id for code-joined children.
 */
export const sessionNotes = pgTable('session_notes', {
  id: varchar('id', { length: 255 }).primaryKey(),
  bookingId: varchar('booking_id', { length: 255 }).notNull().references(() => bookings.id, { onDelete: 'cascade' }),
  ownerId: varchar('owner_id', { length: 255 }),
  kind: varchar('kind', { length: 20 }).notNull(),
  title: varchar('title', { length: 255 }),
  content: text('content').notNull().default(''),
  color: varchar('color', { length: 20 }).default('yellow'),
  authorName: varchar('author_name', { length: 255 }),
  authorRole: varchar('author_role', { length: 50 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

/**
 * Parent-raised session disputes. The settlement cron never splits a booking
 * with an `open` dispute; `resolved`/`rejected` unblock the next tick.
 */
export const disputes = pgTable('disputes', {
  id: varchar('id', { length: 255 }).primaryKey(),
  bookingId: varchar('booking_id', { length: 255 }).notNull().references(() => bookings.id, { onDelete: 'cascade' }),
  createdBy: varchar('created_by', { length: 255 }),
  issue: text('issue').notNull(),
  status: varchar('status', { length: 50 }).default('open'),
  resolution: text('resolution'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export type SessionJoinCode = InferSelectModel<typeof sessionJoinCodes>;
export type SessionEvent = InferSelectModel<typeof sessionEvents>;
export type WhiteboardSnapshot = InferSelectModel<typeof whiteboardSnapshots>;
export type Dispute = InferSelectModel<typeof disputes>;
export type SessionNote = InferSelectModel<typeof sessionNotes>;

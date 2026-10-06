import {
    pgTable,
    varchar,
    text,
    integer,
    jsonb,
    timestamp,
    index,
} from 'drizzle-orm/pg-core';
import { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { adminUsers } from './adminUsers';

/**
 * admin_message_groups
 * A campaign that one or more broadcast sends belong to. Cancelling a group
 * stops every queued/running send inside it (already-delivered mail is not
 * recalled). Mandatory: a broadcast can never exist without a group.
 */
export const adminMessageGroups = pgTable('admin_message_groups', {
    id: varchar('id', { length: 255 }).primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    // 'open' | 'completed' | 'cancelled'
    status: varchar('status', { length: 50 }).default('open').notNull(),
    createdBy: varchar('created_by', { length: 255 }).references(() => adminUsers.id),
    cancelledAt: timestamp('cancelled_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * admin_broadcasts
 * One targeted send to a resolved audience segment. `segment` is the raw
 * audience filter object so a send is always reproducible/auditable.
 */
export const adminBroadcasts = pgTable('admin_broadcasts', {
    id: varchar('id', { length: 255 }).primaryKey(),
    groupId: varchar('group_id', { length: 255 })
        .notNull()
        .references(() => adminMessageGroups.id),
    // 'teacher' | 'parent'
    role: varchar('role', { length: 20 }).notNull(),
    segment: jsonb('segment').default({}).notNull(),
    subject: varchar('subject', { length: 500 }).notNull(),
    messageHtml: text('message_html').notNull(),
    // 'queued' | 'running' | 'completed' | 'partial' | 'cancelled' | 'failed' | 'interrupted'
    status: varchar('status', { length: 50 }).default('queued').notNull(),
    totalRecipients: integer('total_recipients').default(0).notNull(),
    sentCount: integer('sent_count').default(0).notNull(),
    failedCount: integer('failed_count').default(0).notNull(),
    skippedCount: integer('skipped_count').default(0).notNull(),
    createdBy: varchar('created_by', { length: 255 }).references(() => adminUsers.id),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
    index('admin_broadcasts_group_id_idx').on(table.groupId),
    index('admin_broadcasts_status_idx').on(table.status),
]);

/**
 * admin_broadcast_recipients
 * Per-recipient snapshot taken at queue time. Terminal status means the row
 * never changes again, which makes retry-failed a simple status filter.
 */
export const adminBroadcastRecipients = pgTable('admin_broadcast_recipients', {
    id: varchar('id', { length: 255 }).primaryKey(),
    broadcastId: varchar('broadcast_id', { length: 255 })
        .notNull()
        .references(() => adminBroadcasts.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 255 }),
    email: varchar('email', { length: 255 }).notNull(),
    firstName: varchar('first_name', { length: 255 }),
    // 'pending' | 'sending' | 'sent' | 'failed' | 'skipped' | 'cancelled'
    status: varchar('status', { length: 20 }).default('pending').notNull(),
    error: text('error'),
    sentAt: timestamp('sent_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
    index('admin_broadcast_recipients_broadcast_idx').on(table.broadcastId),
    index('admin_broadcast_recipients_status_idx').on(table.broadcastId, table.status),
]);

export type AdminMessageGroup = InferSelectModel<typeof adminMessageGroups>;
export type NewAdminMessageGroup = InferInsertModel<typeof adminMessageGroups>;
export type AdminBroadcast = InferSelectModel<typeof adminBroadcasts>;
export type NewAdminBroadcast = InferInsertModel<typeof adminBroadcasts>;
export type AdminBroadcastRecipient = InferSelectModel<typeof adminBroadcastRecipients>;
export type NewAdminBroadcastRecipient = InferInsertModel<typeof adminBroadcastRecipients>;

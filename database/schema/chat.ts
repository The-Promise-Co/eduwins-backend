import {
  pgTable,
  varchar,
  text,
  boolean,
  timestamp,
} from 'drizzle-orm/pg-core';
import { InferSelectModel } from 'drizzle-orm';
import { users } from './users';

export const conversations = pgTable('conversations', {
  id: varchar('id', { length: 255 }).primaryKey(),
  type: varchar('type', { length: 50 }).notNull().default('direct'), // 'direct' | 'group'
  status: varchar('status', { length: 50 }).notNull().default('pending'), // 'pending' | 'accepted' | 'declined'
  title: varchar('title', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const conversationParticipants = pgTable('conversation_participants', {
  id: varchar('id', { length: 255 }).primaryKey(),
  conversationId: varchar('conversation_id', { length: 255 }).notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  joinedAt: timestamp('joined_at').defaultNow(),
  lastReadAt: timestamp('last_read_at'),
  isMuted: boolean('is_muted').default(false),
});

export const messages = pgTable('messages', {
  id: varchar('id', { length: 255 }).primaryKey(),
  conversationId: varchar('conversation_id', { length: 255 }).notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  senderId: varchar('sender_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  type: varchar('type', { length: 50 }).notNull().default('text'), // 'text' | 'image' | 'file'
  attachmentUrl: text('attachment_url'),
  flagged: boolean('flagged').default(false),
  flaggedReason: varchar('flagged_reason', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const messageReadReceipts = pgTable('message_read_receipts', {
  id: varchar('id', { length: 255 }).primaryKey(),
  messageId: varchar('message_id', { length: 255 }).notNull().references(() => messages.id, { onDelete: 'cascade' }),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  readAt: timestamp('read_at').defaultNow(),
});

export type Conversation = InferSelectModel<typeof conversations>;
export type ConversationParticipant = InferSelectModel<typeof conversationParticipants>;
export type Message = InferSelectModel<typeof messages>;
export type MessageReadReceipt = InferSelectModel<typeof messageReadReceipts>;

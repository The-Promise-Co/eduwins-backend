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
import { users } from './users';

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

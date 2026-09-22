import {
  pgTable,
  varchar,
  text,
  boolean,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core';
import { InferSelectModel, InferInsertModel } from 'drizzle-orm';

export const adminUsers = pgTable('admin_users', {
  id: varchar('id', { length: 255 }).primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash'),
  firstName: varchar('first_name', { length: 255 }).notNull(),
  lastName: varchar('last_name', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull().default('admin'),
  permissions: jsonb('permissions').default({}).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  lastLogin: timestamp('last_login'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type AdminStaff = InferSelectModel<typeof adminUsers>;
export type NewAdminStaff = InferInsertModel<typeof adminUsers>;

import {
  pgTable,
  varchar,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { users } from './users';

/**
 * children
 * Links a parent user to a child user.
 * Each child is a full user (role = 'student') in the users table.
 * The children table stores the parent → child relationship plus
 * child-specific metadata (grade, school, notes).
 */
export const children = pgTable('children', {
  id: varchar('id', { length: 255 }).primaryKey(),

  // The parent who registered this child
  parentId: varchar('parent_id', { length: 255 })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  // The child's own user account
  userId: varchar('user_id', { length: 255 })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  firstName: varchar('first_name', { length: 255 }).notNull(),
  lastName: varchar('last_name', { length: 255 }).notNull(),

  // Child-specific metadata
  dateOfBirth: varchar('date_of_birth', { length: 50 }),  // ISO date string
  grade: varchar('grade', { length: 100 }),                // e.g. 'JSS 1', 'SS 2'
  school: varchar('school', { length: 255 }),
  notes: text('notes'),

  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export type Child = InferSelectModel<typeof children>;
export type NewChild = InferInsertModel<typeof children>;

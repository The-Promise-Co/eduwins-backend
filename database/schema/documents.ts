import { sql } from 'drizzle-orm';
import {
    pgTable,
    varchar,
    text,
    boolean,
    timestamp,
} from 'drizzle-orm/pg-core';
import { teacherProfiles } from './teacherProfiles';

export const teacherDocuments = pgTable('teacher_documents', {
    id: varchar('id', { length: 255 }).primaryKey(),
    teacherId: varchar('teacher_id', { length: 255 })
        .notNull()
        .references(() => teacherProfiles.userId, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    tags: text('tags')
        .array()
        .default(sql`ARRAY[]::text[]`)
        .notNull(),
    verified: boolean('verified').default(false).notNull(),
    verifiedAt: timestamp('verified_at'),
    uploadedAt: timestamp('uploaded_at').defaultNow().notNull(),
});

export type TeacherDocument = typeof teacherDocuments.$inferSelect;
export type NewTeacherDocument = typeof teacherDocuments.$inferInsert;

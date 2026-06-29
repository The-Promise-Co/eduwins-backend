import {
  bigserial,
  boolean,
  date,
  pgTable,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import { teacherProfiles } from './teacherProfiles';

export const teacherEducations = pgTable('teacher_educations', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => teacherProfiles.userId, { onDelete: 'cascade' }),
  institutionName: varchar('institution_name', { length: 255 }).notNull(),
  degree: varchar('degree', { length: 150 }),
  fieldOfStudy: varchar('field_of_study', { length: 150 }),
  grade: varchar('grade', { length: 100 }),
  startDate: date('start_date'),
  endDate: date('end_date'),
  isCurrent: boolean('is_current').default(false).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const teacherCertifications = pgTable('teacher_certifications', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => teacherProfiles.userId, { onDelete: 'cascade' }),
  certificationName: varchar('certification_name', { length: 255 }).notNull(),
  issuingOrganization: varchar('issuing_organization', { length: 255 }).notNull(),
  credentialId: varchar('credential_id', { length: 255 }),
  credentialUrl: varchar('credential_url', { length: 500 }),
  imageUrl: varchar('image_url', { length: 500 }),
  issueDate: date('issue_date'),
  expiryDate: date('expiry_date'),
  doesNotExpire: boolean('does_not_expire').default(false).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type TeacherEducation = typeof teacherEducations.$inferSelect;
export type NewTeacherEducation = typeof teacherEducations.$inferInsert;
export type TeacherCertification = typeof teacherCertifications.$inferSelect;
export type NewTeacherCertification = typeof teacherCertifications.$inferInsert;

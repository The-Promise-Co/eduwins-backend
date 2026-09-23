import {
  pgTable,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core';
import { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { users } from './users';

/**
 * assessments
 * Teacher-created quizzes. `status` is 'draft' | 'published' | 'archived'.
 * Questions live in `assessment_questions`; invites in `assessment_assignments`.
 */
export const assessments = pgTable('assessments', {
  id: varchar('id', { length: 255 }).primaryKey(),
  createdBy: varchar('created_by', { length: 255 }).references(() => users.id, { onDelete: 'set null' }),
  title: varchar('title', { length: 255 }).notNull(),
  subject: varchar('subject', { length: 255 }).notNull(),
  description: text('description'),
  durationMinutes: integer('duration_minutes').notNull().default(30),
  totalMarks: integer('total_marks').notNull().default(0),
  dueAt: timestamp('due_at'),
  status: varchar('status', { length: 50 }).notNull().default('draft'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

/**
 * assessment_questions
 * One row per question. `type` is 'mcq_single' | 'true_false' | 'short_answer'.
 * - mcq_single: `options` = [{ id, label }], `correctOptionId` set.
 * - true_false: `correctBoolean` set.
 * - short_answer: graded manually, no correct answer stored.
 */
export const assessmentQuestions = pgTable('assessment_questions', {
  id: varchar('id', { length: 255 }).primaryKey(),
  assessmentId: varchar('assessment_id', { length: 255 })
    .notNull()
    .references(() => assessments.id, { onDelete: 'cascade' }),
  prompt: text('prompt').notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  marks: integer('marks').notNull().default(1),
  options: jsonb('options').$type<Array<{ id: string; label: string }> | null>(),
  correctOptionId: varchar('correct_option_id', { length: 50 }),
  correctBoolean: boolean('correct_boolean'),
  sectionId: varchar('section_id', { length: 255 }).references(() => assessmentSections.id, { onDelete: 'set null' }),
  orderIndex: integer('order_index').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

/**
 * assessment_sections
 * Teacher-defined exam-style groupings (Section A/B/C). Display-only:
 * marks live on questions, timing on the assessment. Deleting a section
 * orphans its questions (section_id → null) instead of destroying them.
 * Assessments with zero sections render their questions as a flat list.
 */
export const assessmentSections = pgTable('assessment_sections', {
  id: varchar('id', { length: 255 }).primaryKey(),
  assessmentId: varchar('assessment_id', { length: 255 })
    .notNull()
    .references(() => assessments.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  instructions: text('instructions'),
  orderIndex: integer('order_index').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

/**
 * assessment_assignments
 * Teacher → learner invites. `assigneeType` is 'parent' | 'child';
 * `assigneeId` is a users.id (parent) or children.id (child).
 * Auto-assigned on create (no accept step). Revoke keeps the row with
 * status 'revoked' for audit — revoked learners lose access.
 * `status` is 'assigned' | 'started' | 'submitted' | 'graded' | 'revoked'.
 */
export const assessmentAssignments = pgTable('assessment_assignments', {
  id: varchar('id', { length: 255 }).primaryKey(),
  assessmentId: varchar('assessment_id', { length: 255 })
    .notNull()
    .references(() => assessments.id, { onDelete: 'cascade' }),
  assigneeType: varchar('assignee_type', { length: 20 }).notNull(),
  assigneeId: varchar('assignee_id', { length: 255 }).notNull(),
  dueAt: timestamp('due_at'),
  status: varchar('status', { length: 50 }).notNull().default('assigned'),
  score: integer('score'),
  attemptId: varchar('attempt_id', { length: 255 }),
  startedAt: timestamp('started_at'),
  submittedAt: timestamp('submitted_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

/**
 * assessment_attempts
 * One attempt per assignment (resume in-progress instead of duplicating).
 * `answers` maps questionId → raw answer string. `status` is
 * 'in_progress' | 'submitted' | 'graded'. submittedAt is server-set and
 * authoritative — the client countdown is display-only.
 */
export const assessmentAttempts = pgTable('assessment_attempts', {
  id: varchar('id', { length: 255 }).primaryKey(),
  assessmentId: varchar('assessment_id', { length: 255 })
    .notNull()
    .references(() => assessments.id, { onDelete: 'cascade' }),
  assignmentId: varchar('assignment_id', { length: 255 })
    .notNull()
    .references(() => assessmentAssignments.id, { onDelete: 'cascade' }),
  answers: jsonb('answers').$type<Record<string, string>>().default({}).notNull(),
  score: integer('score'),
  status: varchar('status', { length: 50 }).notNull().default('in_progress'),
  startedAt: timestamp('started_at').defaultNow(),
  submittedAt: timestamp('submitted_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export type Assessment = InferSelectModel<typeof assessments>;
export type NewAssessment = InferInsertModel<typeof assessments>;
export type AssessmentQuestion = InferSelectModel<typeof assessmentQuestions>;
export type NewAssessmentQuestion = InferInsertModel<typeof assessmentQuestions>;
export type AssessmentSection = InferSelectModel<typeof assessmentSections>;
export type NewAssessmentSection = InferInsertModel<typeof assessmentSections>;
export type AssessmentAssignment = InferSelectModel<typeof assessmentAssignments>;
export type NewAssessmentAssignment = InferInsertModel<typeof assessmentAssignments>;
export type AssessmentAttempt = InferSelectModel<typeof assessmentAttempts>;
export type NewAssessmentAttempt = InferInsertModel<typeof assessmentAttempts>;

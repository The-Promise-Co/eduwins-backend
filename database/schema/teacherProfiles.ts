import { sql } from 'drizzle-orm';
import {
    pgTable,
    pgEnum,
    varchar,
    decimal,
    integer,
    boolean,
    text,
    timestamp,
    jsonb,
} from 'drizzle-orm/pg-core';
import { users } from './users';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const educationLevelEnum = pgEnum('education_level', [
    'primary',
    'secondary',
    'university',
    'adult',
]);

export const sessionFormatEnum = pgEnum('session_format', [
    'one_on_one',
    'small_group',  // 2–5 students
    'large_group',  // 6+
]);

export const deliveryModeEnum = pgEnum('delivery_mode', [
    'online',
    'in_person',
    'both',
]);

export const dayOfWeekEnum = pgEnum('day_of_week', [
    'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun',
]);

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

export const teacherProfiles = pgTable('teacher_profiles', {

    // ── Core / platform-managed ──────────────────────────────────────────────

    userId: varchar('user_id', { length: 255 })
        .primaryKey()
        .references(() => users.id),

    isApproved: boolean('is_approved').default(false).notNull(),
    isVerified: boolean('is_verified').default(false).notNull(),
    idVerified: boolean('id_verified').default(false).notNull(),
    searchRank: varchar('search_rank', { length: 50 }).default('normal').notNull(),
    ratingAvg: decimal('rating_avg', { precision: 3, scale: 2 }).default('0').notNull(),
    totalSessions: integer('total_sessions').default(0).notNull(),

    // ── Financials (platform-managed, not editable by teacher) ───────────────

    baseHourlyRate: decimal('base_hourly_rate', { precision: 20, scale: 2 }).default('0').notNull(),
    totalEarnings: decimal('total_earnings', { precision: 20, scale: 2 }).default('0').notNull(),

    // ── Identity (teacher editable) ──────────────────────────────────────────

    photoUrl: text('photo_url'),
    videoVerified: text('video_verified'),
    pronouns: varchar('pronouns', { length: 50 }),
    bio: text('bio'),

    // e.g. ['English', 'French']
    languages: text('languages')
        .array()
        .default(sql`ARRAY[]::text[]`)
        .notNull(),

    // ── Qualifications ───────────────────────────────────────────────────────

    highestDegree: text('highest_degree'),
    institution: text('institution'),
    yearsOfExperience: integer('years_of_experience'),

    // e.g. ['B.Sc Mathematics', 'PGCE']
    certifications: text('certifications')
        .array()
        .default(sql`ARRAY[]::text[]`)
        .notNull(),

    // ── Subjects ─────────────────────────────────────────────────────────────

    // Free-text subject names; keeps things flexible across curricula
    // e.g. ['Mathematics', 'Further Maths', 'Physics']
    subjects: text('subjects')
        .array()
        .default(sql`ARRAY[]::text[]`)
        .notNull(),

    educationLevels: educationLevelEnum('education_levels')
        .array()
        .default(sql`ARRAY[]::education_level[]`)
        .notNull(),

    // ── Session types ────────────────────────────────────────────────────────

    sessionFormats: sessionFormatEnum('session_formats')
        .array()
        .default(sql`ARRAY[]::session_format[]`)
        .notNull(),

    // Duration options offered, stored in minutes — e.g. [30, 45, 60, 90]
    sessionDurations: integer('session_durations')
        .array()
        .default(sql`ARRAY[]::integer[]`)
        .notNull(),

    deliveryModes: deliveryModeEnum('delivery_modes')
        .array()
        .default(sql`ARRAY[]::delivery_mode[]`)
        .notNull(),

    // ── Availability ─────────────────────────────────────────────────────────

    availability: boolean('availability').default(false).notNull(),

    availabilityConfig: jsonb('availability_config')
        .$type<Record<string, { from: string; to: string }[]> | null>(),

    // IANA timezone string — e.g. 'Africa/Lagos', 'Europe/London'
    timezone: varchar('timezone', { length: 100 }),

    // ── Booking rules ────────────────────────────────────────────────────────

    // Minimum notice a student must give before booking (hours)
    minNoticeHours: integer('min_notice_hours').default(24).notNull(),

    // Gap between consecutive sessions (minutes)
    bufferMinutes: integer('buffer_minutes').default(0).notNull(),

    // Hard caps — null means no limit
    maxSessionsPerWeek: integer('max_sessions_per_week'),
    maxStudentsPerDay: integer('max_students_per_day'),

    // How far in advance a student can cancel without penalty (hours)
    cancellationWindowHours: integer('cancellation_window_hours').default(24).notNull(),

    // ── Notifications ────────────────────────────────────────────────────────

    notifyOnBooking: boolean('notify_on_booking').default(true).notNull(),
    notifyOnCancellation: boolean('notify_on_cancellation').default(true).notNull(),
    notifySessionReminder: boolean('notify_session_reminder').default(true).notNull(),
    notifyMessages: boolean('notify_messages').default(true).notNull(),

    // ── Timestamps ───────────────────────────────────────────────────────────

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TeacherProfile = typeof teacherProfiles.$inferSelect;
export type NewTeacherProfile = typeof teacherProfiles.$inferInsert;

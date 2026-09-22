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

    isAdminApproved: boolean('is_admin_approved').default(false).notNull(),
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

    // ── Location ─────────────────────────────────────────────────────────

    locationState: varchar('location_state', { length: 100 }),
    locationLga: varchar('location_lga', { length: 100 }),
    locationArea: varchar('location_area', { length: 255 }),

    // ── Qualifications ───────────────────────────────────────────────────────

    highestDegree: text('highest_degree'),
    institution: text('institution'),
    yearsOfExperience: integer('years_of_experience'),

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

    deliveryModes: deliveryModeEnum('delivery_modes')
        .array()
        .default(sql`ARRAY[]::delivery_mode[]`)
        .notNull(),

    // ── Availability ─────────────────────────────────────────────────────────

    availability: boolean('availability').default(false).notNull(),

    availabilityConfig: jsonb('availability_config')
        .$type<Record<string, { from: string; to: string }[]> | null>(),

    // ── Booking rules ────────────────────────────────────────────────────────

    // Minimum notice a student must give before booking (hours)
    minNoticeHours: integer('min_notice_hours').default(24).notNull(),

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

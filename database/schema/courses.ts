import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const courseLevelEnum = pgEnum("course_level", [
  "beginner",
  "intermediate",
  "advanced",
  "all_levels",
]);

export const courseStatusEnum = pgEnum("course_status", [
  "draft",
  "archived",
  "published",
]);

export const lessonTypeEnum = pgEnum("lesson_type", [
  "video",
  "article",
]);

// ─── Courses ──────────────────────────────────────────────────────────────────

export const courses = pgTable(
  "courses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    subject: varchar("subject", { length: 100 }),
    level: courseLevelEnum("level").notNull().default("beginner"),
    duration_weeks: integer("duration_weeks").notNull().default(4),
    price: numeric("price", { precision: 10, scale: 2 }),  // null when is_free = true
    is_free: boolean("is_free").notNull().default(false),
    status: courseStatusEnum("status").notNull().default("draft"),
    teacher_id: varchar("teacher_id", { length: 255 }).references(() => users.id),
    enrolled_count: integer("enrolled_count").notNull().default(0),
    rating_avg: numeric("rating_avg", { precision: 3, scale: 1 }).notNull().default("0"),
    tags: varchar("tags", { length: 500 }),               // comma-separated
    thumbnail_url: text("thumbnail_url"),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("courses_status_idx").on(t.status),
    levelIdx: index("courses_level_idx").on(t.level),
    subjectIdx: index("courses_subject_idx").on(t.subject),
  })
);

// ─── Modules ──────────────────────────────────────────────────────────────────

export const modules = pgTable(
  "modules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    course_id: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    order_index: integer("order_index").notNull().default(0),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    courseIdx: index("modules_course_idx").on(t.course_id),
  })
);

// ─── Lessons ──────────────────────────────────────────────────────────────────

export const courseLessons = pgTable(
  "course_lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    module_id: uuid("module_id")
      .notNull()
      .references(() => modules.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    type: lessonTypeEnum("type").notNull(),

    // video
    video_url: text("video_url"),
    duration_seconds: integer("duration_seconds"),

    // article
    content: text("content"),

    order_index: integer("order_index").notNull().default(0),
    is_preview: boolean("is_preview").notNull().default(false),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    moduleIdx: index("course_lessons_module_idx").on(t.module_id),
  })
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const coursesRelations = relations(courses, ({ many }) => ({
  modules: many(modules),
}));

export const modulesRelations = relations(modules, ({ one, many }) => ({
  course: one(courses, { fields: [modules.course_id], references: [courses.id] }),
  lessons: many(courseLessons),
}));

export const courseLessonsRelations = relations(courseLessons, ({ one }) => ({
  module: one(modules, { fields: [courseLessons.module_id], references: [modules.id] }),
}));

// ─── Types ────────────────────────────────────────────────────────────────────

export type Course = typeof courses.$inferSelect;
export type NewCourse = typeof courses.$inferInsert;
export type Module = typeof modules.$inferSelect;
export type NewModule = typeof modules.$inferInsert;
export type CourseLesson = typeof courseLessons.$inferSelect;
export type NewCourseLesson = typeof courseLessons.$inferInsert;

export const LEVELS = ["beginner", "intermediate", "advanced", "all_levels"] as const;
export type CourseLevel = typeof LEVELS[number];
export type CourseStatus = "draft" | "published";
export type LessonType = "video" | "article";

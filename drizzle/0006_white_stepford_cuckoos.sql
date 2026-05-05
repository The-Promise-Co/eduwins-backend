CREATE TYPE "public"."day_of_week" AS ENUM('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun');--> statement-breakpoint
CREATE TYPE "public"."delivery_mode" AS ENUM('online', 'in_person', 'both');--> statement-breakpoint
CREATE TYPE "public"."education_level" AS ENUM('primary', 'secondary', 'university', 'adult');--> statement-breakpoint
CREATE TYPE "public"."session_format" AS ENUM('one_on_one', 'small_group', 'large_group');--> statement-breakpoint
ALTER TABLE "teacher_profiles" ALTER COLUMN "base_hourly_rate" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ALTER COLUMN "total_earnings" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ALTER COLUMN "wallet_balance" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ALTER COLUMN "welfare_balance" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ALTER COLUMN "referral_welfare_boost" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ALTER COLUMN "rating_avg" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ALTER COLUMN "total_sessions" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ALTER COLUMN "is_approved" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ALTER COLUMN "search_rank" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD COLUMN "pronouns" varchar(50);--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD COLUMN "languages" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD COLUMN "highest_degree" text;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD COLUMN "institution" text;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD COLUMN "years_of_experience" integer;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD COLUMN "certifications" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD COLUMN "subjects" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD COLUMN "education_levels" "education_level"[] DEFAULT ARRAY[]::education_level[] NOT NULL;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD COLUMN "session_formats" "session_format"[] DEFAULT ARRAY[]::session_format[] NOT NULL;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD COLUMN "session_durations" integer[] DEFAULT ARRAY[]::integer[] NOT NULL;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD COLUMN "delivery_modes" "delivery_mode"[] DEFAULT ARRAY[]::delivery_mode[] NOT NULL;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD COLUMN "available_days" "day_of_week"[] DEFAULT ARRAY[]::day_of_week[] NOT NULL;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD COLUMN "available_from" time;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD COLUMN "available_to" time;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD COLUMN "timezone" varchar(100);--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD COLUMN "min_notice_hours" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD COLUMN "buffer_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD COLUMN "max_sessions_per_week" integer;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD COLUMN "max_students_per_day" integer;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD COLUMN "cancellation_window_hours" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD COLUMN "notify_on_booking" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD COLUMN "notify_on_cancellation" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD COLUMN "notify_session_reminder" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD COLUMN "notify_messages" boolean DEFAULT true NOT NULL;
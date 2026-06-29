DROP TABLE "housing_applications" CASCADE;--> statement-breakpoint
DROP TABLE "housing_eligibility" CASCADE;--> statement-breakpoint
DROP TABLE "housing_milestones" CASCADE;--> statement-breakpoint
DROP TABLE "housing_properties" CASCADE;--> statement-breakpoint
DROP TABLE "missed_payments" CASCADE;--> statement-breakpoint
DROP TABLE "mortgage_payments" CASCADE;--> statement-breakpoint
DROP TABLE "mortgages" CASCADE;--> statement-breakpoint
DROP TABLE "partnerships" CASCADE;--> statement-breakpoint
DROP TABLE "property_groups" CASCADE;--> statement-breakpoint
DROP TABLE "material_purchases" CASCADE;--> statement-breakpoint
DROP TABLE "subject_videos" CASCADE;--> statement-breakpoint
DROP TABLE "subscriptions" CASCADE;--> statement-breakpoint
DROP TABLE "teaching_materials" CASCADE;--> statement-breakpoint
DROP TABLE "video_access" CASCADE;--> statement-breakpoint
DROP TABLE "ambassadors" CASCADE;--> statement-breakpoint
DROP TABLE "progress_reports" CASCADE;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD COLUMN "availability" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD COLUMN "availability_config" jsonb;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "housing_eligible";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "housing_status";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "has_active_mortgage";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "active_mortgage_id";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "property_owned";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "is_premium";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "subscription_active";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "subscription_id";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "subscription_plan";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "subscription_end_date";--> statement-breakpoint
ALTER TABLE "teacher_profiles" DROP COLUMN "email_verified";--> statement-breakpoint
ALTER TABLE "teacher_profiles" DROP COLUMN "phone_verified";--> statement-breakpoint
ALTER TABLE "teacher_profiles" DROP COLUMN "available_days";--> statement-breakpoint
ALTER TABLE "teacher_profiles" DROP COLUMN "available_from";--> statement-breakpoint
ALTER TABLE "teacher_profiles" DROP COLUMN "available_to";
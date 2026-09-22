ALTER TABLE "teacher_profiles" RENAME COLUMN "is_approved" TO "is_admin_approved";--> statement-breakpoint

ALTER TABLE "users" ADD COLUMN "status" varchar(50) DEFAULT 'active' NOT NULL;
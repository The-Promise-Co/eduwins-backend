ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "users"
SET "email_verified" = true
WHERE "is_verified" = true;--> statement-breakpoint
UPDATE "users"
SET "email_verified" = true
FROM "teacher_profiles"
WHERE "users"."id" = "teacher_profiles"."user_id"
  AND "teacher_profiles"."email_verified" = true;--> statement-breakpoint
UPDATE "users"
SET "phone_verified" = true
FROM "teacher_profiles"
WHERE "users"."id" = "teacher_profiles"."user_id"
  AND "teacher_profiles"."phone_verified" = true;--> statement-breakpoint
ALTER TABLE "teacher_profiles" DROP COLUMN IF EXISTS "email_verified";--> statement-breakpoint
ALTER TABLE "teacher_profiles" DROP COLUMN IF EXISTS "phone_verified";--> statement-breakpoint

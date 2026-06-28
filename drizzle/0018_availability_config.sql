ALTER TABLE "teacher_profiles" ADD COLUMN IF NOT EXISTS "availability" boolean DEFAULT false NOT NULL;
ALTER TABLE "teacher_profiles" ADD COLUMN IF NOT EXISTS "availability_config" jsonb;
ALTER TABLE "teacher_profiles" DROP COLUMN IF EXISTS "available_days";
ALTER TABLE "teacher_profiles" DROP COLUMN IF EXISTS "available_from";
ALTER TABLE "teacher_profiles" DROP COLUMN IF EXISTS "available_to";
ALTER TABLE "teacher_profiles" DROP COLUMN IF EXISTS "availability_schedule";

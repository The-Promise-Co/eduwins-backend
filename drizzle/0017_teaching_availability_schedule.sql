ALTER TABLE "teacher_profiles" ADD COLUMN IF NOT EXISTS "availability_schedule" jsonb DEFAULT '{}'::jsonb NOT NULL;

ALTER TABLE "teacher_profiles" ADD COLUMN IF NOT EXISTS "education" text[] DEFAULT ARRAY[]::text[] NOT NULL;

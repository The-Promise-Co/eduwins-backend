ALTER TABLE "teacher_profiles" ALTER COLUMN "certifications" TYPE jsonb USING COALESCE(to_jsonb("certifications"), '[]'::jsonb);
ALTER TABLE "teacher_profiles" ALTER COLUMN "certifications" SET DEFAULT '[]'::jsonb;
ALTER TABLE "teacher_profiles" ALTER COLUMN "education" TYPE jsonb USING COALESCE(to_jsonb("education"), '[]'::jsonb);
ALTER TABLE "teacher_profiles" ALTER COLUMN "education" SET DEFAULT '[]'::jsonb;

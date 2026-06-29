CREATE TABLE IF NOT EXISTS "teacher_educations" (
  "id" bigserial PRIMARY KEY,
  "user_id" varchar(255) NOT NULL REFERENCES "teacher_profiles"("user_id") ON DELETE cascade,
  "institution_name" varchar(255) NOT NULL,
  "degree" varchar(150),
  "field_of_study" varchar(150),
  "grade" varchar(100),
  "start_date" date,
  "end_date" date,
  "is_current" boolean DEFAULT false NOT NULL,
  "description" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "teacher_certifications" (
  "id" bigserial PRIMARY KEY,
  "user_id" varchar(255) NOT NULL REFERENCES "teacher_profiles"("user_id") ON DELETE cascade,
  "certification_name" varchar(255) NOT NULL,
  "issuing_organization" varchar(255) NOT NULL,
  "credential_id" varchar(255),
  "credential_url" varchar(500),
  "issue_date" date,
  "expiry_date" date,
  "does_not_expire" boolean DEFAULT false NOT NULL,
  "description" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "teacher_profiles" DROP COLUMN IF EXISTS "certifications";
ALTER TABLE "teacher_profiles" DROP COLUMN IF EXISTS "education";

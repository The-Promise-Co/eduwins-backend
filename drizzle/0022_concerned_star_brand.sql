CREATE TABLE "teacher_certifications" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
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
--> statement-breakpoint
CREATE TABLE "teacher_educations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
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
--> statement-breakpoint
ALTER TABLE "teacher_certifications" ADD CONSTRAINT "teacher_certifications_user_id_teacher_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."teacher_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_educations" ADD CONSTRAINT "teacher_educations_user_id_teacher_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."teacher_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_profiles" DROP COLUMN "certifications";
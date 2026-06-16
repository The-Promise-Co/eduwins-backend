CREATE TYPE "public"."config_split_target" AS ENUM('tutor', 'welfare', 'platform_fee');--> statement-breakpoint
CREATE TYPE "public"."config_value_type" AS ENUM('flat_fee', 'percentage');--> statement-breakpoint
CREATE TABLE "course_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teacher_documents" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"teacher_id" varchar(255) NOT NULL,
	"url" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_configs" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"key" varchar(100) NOT NULL,
	"label" varchar(255) NOT NULL,
	"target" "config_split_target" NOT NULL,
	"value_type" "config_value_type" NOT NULL,
	"value" numeric(20, 4) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "platform_configs_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD COLUMN "is_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD COLUMN "phone_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD COLUMN "id_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD COLUMN "video_verified" text;--> statement-breakpoint
ALTER TABLE "children" ADD COLUMN "user_id" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_documents" ADD CONSTRAINT "teacher_documents_teacher_id_teacher_profiles_user_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teacher_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "course_enrollments_course_user_idx" ON "course_enrollments" USING btree ("course_id","user_id");--> statement-breakpoint
ALTER TABLE "children" ADD CONSTRAINT "children_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "children" DROP COLUMN "avatar_url";
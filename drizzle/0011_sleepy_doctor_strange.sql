CREATE TABLE "assessment_assignments" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"assessment_id" varchar(255) NOT NULL,
	"assignee_type" varchar(20) NOT NULL,
	"assignee_id" varchar(255) NOT NULL,
	"due_at" timestamp,
	"status" varchar(50) DEFAULT 'assigned' NOT NULL,
	"score" integer,
	"attempt_id" varchar(255),
	"started_at" timestamp,
	"submitted_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "assessment_attempts" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"assessment_id" varchar(255) NOT NULL,
	"assignment_id" varchar(255) NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"score" integer,
	"status" varchar(50) DEFAULT 'in_progress' NOT NULL,
	"started_at" timestamp DEFAULT now(),
	"submitted_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "assessment_questions" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"assessment_id" varchar(255) NOT NULL,
	"prompt" text NOT NULL,
	"type" varchar(50) NOT NULL,
	"marks" integer DEFAULT 1 NOT NULL,
	"options" jsonb,
	"correct_option_id" varchar(50),
	"correct_boolean" boolean,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"created_by" varchar(255),
	"title" varchar(255) NOT NULL,
	"subject" varchar(255) NOT NULL,
	"description" text,
	"duration_minutes" integer DEFAULT 30 NOT NULL,
	"total_marks" integer DEFAULT 0 NOT NULL,
	"due_at" timestamp,
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "assessment_assignments" ADD CONSTRAINT "assessment_assignments_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_assignment_id_assessment_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assessment_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_questions" ADD CONSTRAINT "assessment_questions_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
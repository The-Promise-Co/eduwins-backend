CREATE TABLE "assessment_sections" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"assessment_id" varchar(255) NOT NULL,
	"title" varchar(255) NOT NULL,
	"instructions" text,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "assessment_questions" ADD COLUMN "section_id" varchar(255);--> statement-breakpoint
ALTER TABLE "assessment_sections" ADD CONSTRAINT "assessment_sections_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_questions" ADD CONSTRAINT "assessment_questions_section_id_assessment_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."assessment_sections"("id") ON DELETE set null ON UPDATE no action;
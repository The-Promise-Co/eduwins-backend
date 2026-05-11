ALTER TABLE "courses" ADD COLUMN "teacher_id" varchar(255);--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "enrolled_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "rating_avg" numeric(3, 1) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
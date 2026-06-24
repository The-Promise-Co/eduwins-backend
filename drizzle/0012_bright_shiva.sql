DROP INDEX "course_enrollments_course_user_idx";--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "paystack_reference" varchar(255);--> statement-breakpoint
CREATE UNIQUE INDEX "course_enrollments_course_user_unique" ON "course_enrollments" USING btree ("course_id","user_id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_paystack_reference_unique" UNIQUE("paystack_reference");
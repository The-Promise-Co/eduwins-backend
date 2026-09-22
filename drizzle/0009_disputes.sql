CREATE TABLE "disputes" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"booking_id" varchar(255) NOT NULL,
	"created_by" varchar(255),
	"issue" text NOT NULL,
	"status" varchar(50) DEFAULT 'open',
	"resolution" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;
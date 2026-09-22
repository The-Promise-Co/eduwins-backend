CREATE TABLE "session_notes" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"booking_id" varchar(255) NOT NULL,
	"owner_id" varchar(255),
	"kind" varchar(20) NOT NULL,
	"title" varchar(255),
	"content" text DEFAULT '' NOT NULL,
	"color" varchar(20) DEFAULT 'yellow',
	"author_name" varchar(255),
	"author_role" varchar(50),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "session_notes" ADD CONSTRAINT "session_notes_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;
CREATE TABLE "session_events" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"booking_id" varchar(255) NOT NULL,
	"participant_identity" varchar(255),
	"participant_name" varchar(255),
	"participant_role" varchar(50),
	"child_id" varchar(255),
	"event" varchar(50),
	"timestamp" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "session_join_codes" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"booking_id" varchar(255) NOT NULL,
	"child_id" varchar(255) NOT NULL,
	"code" varchar(20) NOT NULL,
	"used" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "session_join_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "session_room_id" varchar(255);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "session_started_at" timestamp;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "session_ended_at" timestamp;--> statement-breakpoint
ALTER TABLE "session_events" ADD CONSTRAINT "session_events_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_join_codes" ADD CONSTRAINT "session_join_codes_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_join_codes" ADD CONSTRAINT "session_join_codes_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;
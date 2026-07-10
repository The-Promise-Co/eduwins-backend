CREATE TABLE "booking_children" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"booking_id" varchar(255) NOT NULL,
	"child_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "booking_for" varchar(50) DEFAULT 'self';--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "scheduled_date" date;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "start_time" varchar(5);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "end_time" varchar(5);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "duration_hours" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "updated_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "booking_children" ADD CONSTRAINT "booking_children_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_children" ADD CONSTRAINT "booking_children_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;
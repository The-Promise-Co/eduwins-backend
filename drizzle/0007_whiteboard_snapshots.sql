CREATE TABLE "whiteboard_snapshots" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"booking_id" varchar(255) NOT NULL,
	"created_by" varchar(255),
	"title" varchar(255),
	"scene" text NOT NULL,
	"image_url" text,
	"author_name" varchar(255),
	"author_role" varchar(50),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "whiteboard_snapshots" ADD CONSTRAINT "whiteboard_snapshots_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;
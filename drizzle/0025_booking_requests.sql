ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "booking_for" varchar(50) DEFAULT 'self';
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "scheduled_date" date;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "start_time" varchar(5);
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "end_time" varchar(5);
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "duration_hours" numeric(6, 2);
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now();

CREATE TABLE IF NOT EXISTS "booking_children" (
  "id" varchar(255) PRIMARY KEY,
  "booking_id" varchar(255) NOT NULL REFERENCES "bookings"("id") ON DELETE cascade,
  "child_id" varchar(255) NOT NULL REFERENCES "children"("id") ON DELETE cascade,
  "created_at" timestamp DEFAULT now()
);

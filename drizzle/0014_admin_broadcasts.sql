CREATE TABLE "admin_message_groups" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"status" varchar(50) DEFAULT 'open' NOT NULL,
	"created_by" varchar(255),
	"cancelled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_broadcasts" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"group_id" varchar(255) NOT NULL,
	"role" varchar(20) NOT NULL,
	"segment" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"subject" varchar(500) NOT NULL,
	"message_html" text NOT NULL,
	"status" varchar(50) DEFAULT 'queued' NOT NULL,
	"total_recipients" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"created_by" varchar(255),
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_broadcast_recipients" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"broadcast_id" varchar(255) NOT NULL,
	"user_id" varchar(255),
	"email" varchar(255) NOT NULL,
	"first_name" varchar(255),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"error" text,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_message_groups" ADD CONSTRAINT "admin_message_groups_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "admin_broadcasts" ADD CONSTRAINT "admin_broadcasts_group_id_admin_message_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."admin_message_groups"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "admin_broadcasts" ADD CONSTRAINT "admin_broadcasts_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "admin_broadcast_recipients" ADD CONSTRAINT "admin_broadcast_recipients_broadcast_id_admin_broadcasts_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."admin_broadcasts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "admin_broadcasts_group_id_idx" ON "admin_broadcasts" USING btree ("group_id");
--> statement-breakpoint
CREATE INDEX "admin_broadcasts_status_idx" ON "admin_broadcasts" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "admin_broadcast_recipients_broadcast_idx" ON "admin_broadcast_recipients" USING btree ("broadcast_id");
--> statement-breakpoint
CREATE INDEX "admin_broadcast_recipients_status_idx" ON "admin_broadcast_recipients" USING btree ("broadcast_id","status");
--> statement-breakpoint
CREATE INDEX "bookings_parent_id_idx" ON "bookings" USING btree ("parent_id");
--> statement-breakpoint
CREATE INDEX "bookings_teacher_id_idx" ON "bookings" USING btree ("teacher_id");
--> statement-breakpoint
CREATE INDEX "children_parent_id_idx" ON "children" USING btree ("parent_id");

CREATE TABLE IF NOT EXISTS "team_members" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"slug" varchar(255) NOT NULL UNIQUE,
	"name" varchar(255) NOT NULL,
	"title" varchar(255) NOT NULL,
	"bio" text NOT NULL,
	"photo_url" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

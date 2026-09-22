CREATE TABLE "admin_users" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text,
	"first_name" varchar(255) NOT NULL,
	"last_name" varchar(255) NOT NULL,
	"role" varchar(50) DEFAULT 'admin' NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);

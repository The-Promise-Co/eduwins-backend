CREATE TABLE "subscription_plans" (
	"slug" varchar(50) PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"tagline" varchar(255),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"currency" varchar(10) DEFAULT 'NGN' NOT NULL,
	"price_1_month" integer,
	"price_3_months" integer,
	"price_6_months" integer,
	"price_12_months" integer,
	"limits" jsonb NOT NULL,
	"features" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tutor_subscriptions" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"tutor_id" varchar(255) NOT NULL,
	"plan_slug" varchar(50) NOT NULL,
	"duration_months" integer NOT NULL,
	"amount_paid" numeric(20, 2) NOT NULL,
	"currency" varchar(10) DEFAULT 'NGN' NOT NULL,
	"plan_snapshot" jsonb,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"starts_at" timestamp,
	"ends_at" timestamp,
	"activated_at" timestamp,
	"paystack_reference" varchar(255),
	"referral_rewarded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tutor_subscriptions_paystack_reference_unique" UNIQUE("paystack_reference")
);
--> statement-breakpoint
ALTER TABLE "tutor_subscriptions" ADD CONSTRAINT "tutor_subscriptions_tutor_id_users_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tutor_subscriptions_tutor_idx" ON "tutor_subscriptions" USING btree ("tutor_id");--> statement-breakpoint
CREATE INDEX "tutor_subscriptions_status_idx" ON "tutor_subscriptions" USING btree ("status");
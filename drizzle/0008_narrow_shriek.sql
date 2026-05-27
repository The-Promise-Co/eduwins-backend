CREATE TABLE "referrals" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"referrer_id" varchar(255) NOT NULL,
	"referee_id" varchar(255) NOT NULL,
	"subscription_plan" varchar(50),
	"subscription_price" numeric(20, 2),
	"reward_amount" numeric(20, 2),
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"reward_credited" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"rewarded_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_users_id_fk" FOREIGN KEY ("referrer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referee_id_users_id_fk" FOREIGN KEY ("referee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
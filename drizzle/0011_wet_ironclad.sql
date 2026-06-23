CREATE TABLE "wallet_transactions" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"wallet_id" varchar(255) NOT NULL,
	"direction" varchar(20) NOT NULL,
	"amount" numeric(20, 2) NOT NULL,
	"balance_before" numeric(20, 2) NOT NULL,
	"balance_after" numeric(20, 2) NOT NULL,
	"type" varchar(100) NOT NULL,
	"reference_type" varchar(100),
	"reference_id" varchar(255),
	"description" varchar(500),
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"owner_type" varchar(50) NOT NULL,
	"owner_id" varchar(255),
	"wallet_type" varchar(50) NOT NULL,
	"balance" numeric(20, 2) DEFAULT '0' NOT NULL,
	"currency" varchar(10) DEFAULT 'NGN' NOT NULL,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wallets_owner_wallet_unique" ON "wallets" USING btree ("owner_type","owner_id","wallet_type");--> statement-breakpoint
ALTER TABLE "parent_profiles" DROP COLUMN "referral_discount";--> statement-breakpoint
ALTER TABLE "teacher_profiles" DROP COLUMN "wallet_balance";--> statement-breakpoint
ALTER TABLE "teacher_profiles" DROP COLUMN "welfare_balance";--> statement-breakpoint
ALTER TABLE "teacher_profiles" DROP COLUMN "referral_welfare_boost";
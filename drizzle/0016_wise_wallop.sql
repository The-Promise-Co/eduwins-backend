CREATE TABLE "payout_account_change_logs" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"teacher_id" varchar(255),
	"old_bank_code" varchar(50),
	"old_bank_name" varchar(255),
	"old_account_number" varchar(50),
	"old_account_name" varchar(255),
	"new_bank_code" varchar(50),
	"new_bank_name" varchar(255),
	"new_account_number" varchar(50),
	"new_account_name" varchar(255),
	"changed_at" timestamp DEFAULT now() NOT NULL,
	"changed_by" varchar(50) DEFAULT 'tutor' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_accounts" (
	"teacher_id" varchar(255) PRIMARY KEY NOT NULL,
	"bank_code" varchar(50) NOT NULL,
	"bank_name" varchar(255),
	"account_number" varchar(50) NOT NULL,
	"account_name" varchar(255) NOT NULL,
	"recipient_code" varchar(255),
	"last_changed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_requests" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"teacher_id" varchar(255),
	"amount" numeric(20, 2) NOT NULL,
	"net_amount" numeric(20, 2),
	"processing_fee" numeric(20, 2),
	"bank_code" varchar(50),
	"bank_name" varchar(255),
	"account_number" varchar(50),
	"account_name" varchar(255),
	"recipient_code" varchar(255),
	"narration" text,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"approved_by" varchar(255),
	"approved_at" timestamp,
	"approved_reason" text,
	"declined_by" varchar(255),
	"declined_at" timestamp,
	"decline_reason" text,
	"paystack_reference" varchar(255),
	"transfer_code" varchar(255),
	"failure_reason" text,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "payout_requests_paystack_reference_unique" UNIQUE("paystack_reference")
);
--> statement-breakpoint
DROP TABLE "withdrawals" CASCADE;--> statement-breakpoint
ALTER TABLE "payout_account_change_logs" ADD CONSTRAINT "payout_account_change_logs_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_accounts" ADD CONSTRAINT "payout_accounts_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
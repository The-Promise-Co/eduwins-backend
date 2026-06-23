CREATE TABLE IF NOT EXISTS "wallets" (
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

CREATE UNIQUE INDEX IF NOT EXISTS "wallets_owner_wallet_unique"
  ON "wallets" ("owner_type", "owner_id", "wallet_type");

ALTER TABLE "wallets"
  ADD CONSTRAINT "wallets_owner_id_users_id_fk"
  FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;

CREATE TABLE IF NOT EXISTS "wallet_transactions" (
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

ALTER TABLE "wallet_transactions"
  ADD CONSTRAINT "wallet_transactions_wallet_id_wallets_id_fk"
  FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE cascade ON UPDATE no action;

INSERT INTO "wallets" ("id", "owner_type", "owner_id", "wallet_type", "balance", "currency", "status")
SELECT 'wallet-main-' || "user_id", 'user', "user_id", 'main', COALESCE("wallet_balance", 0), 'NGN', 'active'
FROM "teacher_profiles"
ON CONFLICT DO NOTHING;

INSERT INTO "wallets" ("id", "owner_type", "owner_id", "wallet_type", "balance", "currency", "status")
SELECT 'wallet-welfare-' || "user_id", 'user', "user_id", 'welfare', COALESCE("welfare_balance", 0), 'NGN', 'active'
FROM "teacher_profiles"
ON CONFLICT DO NOTHING;

INSERT INTO "wallets" ("id", "owner_type", "owner_id", "wallet_type", "balance", "currency", "status")
SELECT 'wallet-referrals-' || "id", 'user', "id", 'referrals', 0, 'NGN', 'active'
FROM "users"
WHERE "role" IN ('teacher', 'parent')
ON CONFLICT DO NOTHING;

INSERT INTO "wallets" ("id", "owner_type", "owner_id", "wallet_type", "balance", "currency", "status")
VALUES ('wallet-platform-fees', 'platform', NULL, 'fees', 0, 'NGN', 'active')
ON CONFLICT DO NOTHING;

ALTER TABLE "teacher_profiles" DROP COLUMN IF EXISTS "wallet_balance";
ALTER TABLE "teacher_profiles" DROP COLUMN IF EXISTS "welfare_balance";
ALTER TABLE "teacher_profiles" DROP COLUMN IF EXISTS "referral_welfare_boost";
ALTER TABLE "parent_profiles" DROP COLUMN IF EXISTS "referral_discount";

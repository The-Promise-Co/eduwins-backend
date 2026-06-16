CREATE TYPE "config_split_target" AS ENUM ('tutor', 'welfare', 'platform_fee');
CREATE TYPE "config_value_type" AS ENUM ('flat_fee', 'percentage');

CREATE TABLE IF NOT EXISTS "platform_configs" (
  "id" varchar(255) PRIMARY KEY NOT NULL,
  "key" varchar(100) NOT NULL UNIQUE,
  "label" varchar(255) NOT NULL,
  "target" "config_split_target" NOT NULL,
  "value_type" "config_value_type" NOT NULL,
  "value" numeric(20, 4) NOT NULL,
  "description" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

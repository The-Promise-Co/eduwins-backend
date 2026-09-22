CREATE TYPE "public"."day_of_week" AS ENUM('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun');--> statement-breakpoint
CREATE TYPE "public"."delivery_mode" AS ENUM('online', 'in_person', 'both');--> statement-breakpoint
CREATE TYPE "public"."education_level" AS ENUM('primary', 'secondary', 'university', 'adult');--> statement-breakpoint
CREATE TYPE "public"."session_format" AS ENUM('one_on_one', 'small_group', 'large_group');--> statement-breakpoint
CREATE TYPE "public"."course_level" AS ENUM('beginner', 'intermediate', 'advanced', 'all_levels');--> statement-breakpoint
CREATE TYPE "public"."course_status" AS ENUM('draft', 'archived', 'published');--> statement-breakpoint
CREATE TYPE "public"."lesson_type" AS ENUM('video', 'article');--> statement-breakpoint
CREATE TYPE "public"."config_split_target" AS ENUM('tutor', 'welfare', 'platform_fee');--> statement-breakpoint
CREATE TYPE "public"."config_value_type" AS ENUM('flat_fee', 'percentage');--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "subjects_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "parent_profiles" (
	"user_id" varchar(255) PRIMARY KEY NOT NULL,
	"default_location_lga" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"phone" varchar(50),
	"password_hash" text,
	"first_name" varchar(255) NOT NULL,
	"last_name" varchar(255) NOT NULL,
	"role" varchar(50) NOT NULL,
	"is_verified" boolean DEFAULT false,
	"email_verified" boolean DEFAULT false NOT NULL,
	"phone_verified" boolean DEFAULT false NOT NULL,
	"trust_score" integer DEFAULT 0,
	"referral_code" varchar(50),
	"referral_count" integer DEFAULT 0,
	"referred_by" varchar(255),
	"referral_rewarded" boolean DEFAULT false,
	"photo_url" text,
	"bio" text,
	"two_factor_enabled" boolean DEFAULT false,
	"two_factor_secret" text,
	"two_factor_temp_secret" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "users_referral_code_unique" UNIQUE("referral_code")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"token" varchar(255) NOT NULL,
	"otp" varchar(10) NOT NULL,
	"type" varchar(50) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "verification_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "teacher_profiles" (
	"user_id" varchar(255) PRIMARY KEY NOT NULL,
	"is_approved" boolean DEFAULT false NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"id_verified" boolean DEFAULT false NOT NULL,
	"search_rank" varchar(50) DEFAULT 'normal' NOT NULL,
	"rating_avg" numeric(3, 2) DEFAULT '0' NOT NULL,
	"total_sessions" integer DEFAULT 0 NOT NULL,
	"base_hourly_rate" numeric(20, 2) DEFAULT '0' NOT NULL,
	"total_earnings" numeric(20, 2) DEFAULT '0' NOT NULL,
	"photo_url" text,
	"video_verified" text,
	"pronouns" varchar(50),
	"bio" text,
	"languages" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"highest_degree" text,
	"institution" text,
	"years_of_experience" integer,
	"subjects" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"education_levels" "education_level"[] DEFAULT ARRAY[]::education_level[] NOT NULL,
	"session_formats" "session_format"[] DEFAULT ARRAY[]::session_format[] NOT NULL,
	"delivery_modes" "delivery_mode"[] DEFAULT ARRAY[]::delivery_mode[] NOT NULL,
	"availability" boolean DEFAULT false NOT NULL,
	"availability_config" jsonb,
	"min_notice_hours" integer DEFAULT 24 NOT NULL,
	"notify_on_booking" boolean DEFAULT true NOT NULL,
	"notify_on_cancellation" boolean DEFAULT true NOT NULL,
	"notify_session_reminder" boolean DEFAULT true NOT NULL,
	"notify_messages" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_children" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"booking_id" varchar(255) NOT NULL,
	"child_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"parent_id" varchar(255),
	"teacher_id" varchar(255),
	"child_id" varchar(255),
	"subject" varchar(255),
	"status" varchar(50) DEFAULT 'pending',
	"booking_for" varchar(50) DEFAULT 'self',
	"scheduled_date" date,
	"start_time" varchar(5),
	"end_time" varchar(5),
	"duration_hours" numeric(6, 2),
	"note" text,
	"payment_reference" varchar(255),
	"total_amount" numeric(20, 2) NOT NULL,
	"reserved_at" timestamp,
	"accepted_at" timestamp,
	"denied_at" timestamp,
	"denial_reason" text,
	"paid_at" timestamp,
	"cancelled_at" timestamp,
	"cancelled_by" varchar(50),
	"cancel_reason" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"booking_id" varchar(255),
	"subject" varchar(255),
	"scheduled_time" timestamp,
	"status" varchar(50) DEFAULT 'scheduled',
	"confirmation_otp" varchar(10),
	"otp_expiry" timestamp,
	"confirmed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "digital_vault" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"teacher_id" varchar(255),
	"title" varchar(255) NOT NULL,
	"description" text,
	"subject" varchar(255),
	"content_type" varchar(50),
	"price" numeric(20, 2) NOT NULL,
	"file_url" text,
	"preview_url" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "earnings" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"teacher_id" varchar(255),
	"total" numeric(20, 2) DEFAULT '0',
	"acquired_from_lessons" numeric(20, 2) DEFAULT '0',
	"acquired_from_vault" numeric(20, 2) DEFAULT '0',
	"acquired_from_referrals" numeric(20, 2) DEFAULT '0',
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255),
	"type" varchar(100),
	"title" varchar(255),
	"message" text,
	"read" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
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
CREATE TABLE "transactions" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"booking_id" varchar(255),
	"teacher_id" varchar(255),
	"paystack_reference" varchar(255),
	"amount" numeric(20, 2) NOT NULL,
	"type" varchar(50) NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "transactions_paystack_reference_unique" UNIQUE("paystack_reference")
);
--> statement-breakpoint
CREATE TABLE "vault_purchases" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"item_id" varchar(255),
	"buyer_id" varchar(255),
	"price_paid" numeric(20, 2),
	"purchase_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "welfare_funds" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"teacher_id" varchar(255),
	"month" varchar(7),
	"amount" numeric(20, 2),
	"lesson_count" integer DEFAULT 0,
	"status" varchar(50) DEFAULT 'locked',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "withdrawals" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"teacher_id" varchar(255),
	"amount" numeric(20, 2) NOT NULL,
	"net_amount" numeric(20, 2),
	"processing_fee" numeric(20, 2),
	"bank_code" varchar(50),
	"account_number" varchar(50),
	"account_name" varchar(255),
	"narration" text,
	"status" varchar(50) DEFAULT 'pending',
	"paystack_reference" varchar(255),
	"failure_reason" text,
	"month" varchar(7),
	"created_at" timestamp DEFAULT now(),
	"completed_at" timestamp,
	"cancelled_at" timestamp,
	CONSTRAINT "withdrawals_paystack_reference_unique" UNIQUE("paystack_reference")
);
--> statement-breakpoint
CREATE TABLE "course_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"type" "lesson_type" NOT NULL,
	"video_url" text,
	"duration_seconds" integer,
	"content" text,
	"order_index" integer DEFAULT 0 NOT NULL,
	"is_preview" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"lesson_id" uuid NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp,
	"last_position_seconds" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"subject" varchar(100),
	"level" "course_level" DEFAULT 'beginner' NOT NULL,
	"duration_weeks" integer DEFAULT 4 NOT NULL,
	"price" numeric(10, 2),
	"is_free" boolean DEFAULT false NOT NULL,
	"status" "course_status" DEFAULT 'draft' NOT NULL,
	"teacher_id" varchar(255),
	"enrolled_count" integer DEFAULT 0 NOT NULL,
	"rating_avg" numeric(3, 1) DEFAULT '0' NOT NULL,
	"tags" varchar(500),
	"thumbnail_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "children" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"parent_id" varchar(255) NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"first_name" varchar(255) NOT NULL,
	"last_name" varchar(255) NOT NULL,
	"date_of_birth" varchar(50),
	"grade" varchar(100),
	"school" varchar(255),
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "teacher_documents" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"teacher_id" varchar(255) NOT NULL,
	"url" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teacher_certifications" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"certification_name" varchar(255) NOT NULL,
	"issuing_organization" varchar(255) NOT NULL,
	"credential_id" varchar(255),
	"credential_url" varchar(500),
	"image_url" varchar(500),
	"issue_date" date,
	"expiry_date" date,
	"does_not_expire" boolean DEFAULT false NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teacher_educations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"institution_name" varchar(255) NOT NULL,
	"degree" varchar(150),
	"field_of_study" varchar(150),
	"grade" varchar(100),
	"start_date" date,
	"end_date" date,
	"is_current" boolean DEFAULT false NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_configs" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"key" varchar(100) NOT NULL,
	"label" varchar(255) NOT NULL,
	"target" "config_split_target" NOT NULL,
	"value_type" "config_value_type" NOT NULL,
	"value" numeric(20, 4) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "platform_configs_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"key" varchar(255) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "conversation_participants" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"conversation_id" varchar(255) NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"joined_at" timestamp DEFAULT now(),
	"last_read_at" timestamp,
	"is_muted" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"type" varchar(50) DEFAULT 'direct' NOT NULL,
	"title" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "message_read_receipts" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"message_id" varchar(255) NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"read_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"conversation_id" varchar(255) NOT NULL,
	"sender_id" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"type" varchar(50) DEFAULT 'text' NOT NULL,
	"attachment_url" text,
	"flagged" boolean DEFAULT false,
	"flagged_reason" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "parent_profiles" ADD CONSTRAINT "parent_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_children" ADD CONSTRAINT "booking_children_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_children" ADD CONSTRAINT "booking_children_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_parent_id_users_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digital_vault" ADD CONSTRAINT "digital_vault_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "earnings" ADD CONSTRAINT "earnings_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_users_id_fk" FOREIGN KEY ("referrer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referee_id_users_id_fk" FOREIGN KEY ("referee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_purchases" ADD CONSTRAINT "vault_purchases_item_id_digital_vault_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."digital_vault"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_purchases" ADD CONSTRAINT "vault_purchases_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_funds" ADD CONSTRAINT "welfare_funds_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_lessons" ADD CONSTRAINT "course_lessons_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_progress" ADD CONSTRAINT "course_progress_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_progress" ADD CONSTRAINT "course_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_progress" ADD CONSTRAINT "course_progress_lesson_id_course_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."course_lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modules" ADD CONSTRAINT "modules_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "children" ADD CONSTRAINT "children_parent_id_users_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "children" ADD CONSTRAINT "children_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_documents" ADD CONSTRAINT "teacher_documents_teacher_id_teacher_profiles_user_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teacher_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_certifications" ADD CONSTRAINT "teacher_certifications_user_id_teacher_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."teacher_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_educations" ADD CONSTRAINT "teacher_educations_user_id_teacher_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."teacher_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_read_receipts" ADD CONSTRAINT "message_read_receipts_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_read_receipts" ADD CONSTRAINT "message_read_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "course_enrollments_course_user_unique" ON "course_enrollments" USING btree ("course_id","user_id");--> statement-breakpoint
CREATE INDEX "course_lessons_module_idx" ON "course_lessons" USING btree ("module_id");--> statement-breakpoint
CREATE UNIQUE INDEX "course_progress_course_user_lesson_unique" ON "course_progress" USING btree ("course_id","user_id","lesson_id");--> statement-breakpoint
CREATE INDEX "courses_status_idx" ON "courses" USING btree ("status");--> statement-breakpoint
CREATE INDEX "courses_level_idx" ON "courses" USING btree ("level");--> statement-breakpoint
CREATE INDEX "courses_subject_idx" ON "courses" USING btree ("subject");--> statement-breakpoint
CREATE INDEX "modules_course_idx" ON "modules" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wallets_owner_wallet_unique" ON "wallets" USING btree ("owner_type","owner_id","wallet_type");
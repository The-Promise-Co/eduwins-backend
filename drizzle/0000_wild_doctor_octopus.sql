CREATE TABLE "ambassadors" (
	"user_id" varchar(255) PRIMARY KEY NOT NULL,
	"mentor_id" varchar(255),
	"level" integer DEFAULT 1,
	"status" varchar(50) DEFAULT 'active',
	"direct_referrals" integer DEFAULT 0,
	"indirect_referrals" integer DEFAULT 0,
	"earned_credits" numeric(20, 2) DEFAULT '0',
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
	"payment_reference" varchar(255),
	"total_amount" numeric(20, 2) NOT NULL,
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
CREATE TABLE "housing_applications" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"teacher_id" varchar(255),
	"property_id" varchar(255),
	"mortgage_id" varchar(255),
	"status" varchar(50) DEFAULT 'pending',
	"property_details" jsonb,
	"mortgage_details" jsonb,
	"applied_at" timestamp DEFAULT now(),
	"approved_at" timestamp,
	"rejected_at" timestamp,
	"rejection_reason" text
);
--> statement-breakpoint
CREATE TABLE "housing_eligibility" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"teacher_id" varchar(255),
	"eligible" boolean DEFAULT false,
	"reason" text,
	"details" jsonb,
	"checked_at" timestamp DEFAULT now(),
	"last_updated" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "housing_milestones" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"teacher_id" varchar(255),
	"milestone_type" varchar(100),
	"amount" numeric(20, 2),
	"achieved_at" timestamp DEFAULT now(),
	"status" varchar(50) DEFAULT 'completed'
);
--> statement-breakpoint
CREATE TABLE "housing_properties" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"property_group_id" varchar(255),
	"partnership_id" varchar(255),
	"address" text,
	"city" varchar(100),
	"state" varchar(100),
	"price" numeric(20, 2),
	"bedrooms" integer,
	"bathrooms" integer,
	"square_feet" integer,
	"description" text,
	"unit_number" integer,
	"status" varchar(50) DEFAULT 'available',
	"occupied_by" varchar(255),
	"occupied_since" timestamp,
	"created_at" timestamp DEFAULT now()
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
CREATE TABLE "material_purchases" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255),
	"material_id" varchar(255),
	"teacher_id" varchar(255),
	"price" numeric(20, 2),
	"transaction_id" varchar(255),
	"purchased_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "missed_payments" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"teacher_id" varchar(255),
	"mortgage_id" varchar(255),
	"due_amount" numeric(20, 2),
	"available_amount" numeric(20, 2),
	"due_date" timestamp NOT NULL,
	"status" varchar(50) DEFAULT 'missed',
	"rescheduled_for" timestamp
);
--> statement-breakpoint
CREATE TABLE "mortgage_payments" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"teacher_id" varchar(255),
	"mortgage_id" varchar(255),
	"amount" numeric(20, 2),
	"principal_paydown" numeric(20, 2),
	"interest_paid" numeric(20, 2),
	"payment_date" timestamp DEFAULT now(),
	"status" varchar(50) DEFAULT 'completed'
);
--> statement-breakpoint
CREATE TABLE "mortgages" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"teacher_id" varchar(255),
	"property_id" varchar(255),
	"property_price" numeric(20, 2),
	"down_payment" numeric(20, 2),
	"principal" numeric(20, 2),
	"loan_term" integer,
	"interest_rate" numeric(5, 2),
	"monthly_payment" numeric(20, 2),
	"monthly_income" numeric(20, 2),
	"debt_to_income_ratio" numeric(5, 2),
	"status" varchar(50) DEFAULT 'active',
	"total_paid" numeric(20, 2) DEFAULT '0',
	"payments_completed" integer DEFAULT 0,
	"payments_missed" integer DEFAULT 0,
	"remaining_balance" numeric(20, 2),
	"start_date" timestamp,
	"end_date" timestamp,
	"next_payment_due" timestamp,
	"last_payment_date" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
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
CREATE TABLE "otps" (
	"phone" varchar(50) PRIMARY KEY NOT NULL,
	"otp" varchar(10) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "parent_profiles" (
	"user_id" varchar(255) PRIMARY KEY NOT NULL,
	"default_location_lga" varchar(255),
	"referral_discount" numeric(20, 2) DEFAULT '0',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "partnerships" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"partner_type" varchar(50),
	"organization_name" varchar(255) NOT NULL,
	"contact_person" varchar(255),
	"email" varchar(255),
	"phone" varchar(50),
	"terms" jsonb,
	"status" varchar(50) DEFAULT 'active',
	"active_since" timestamp,
	"properties_count" integer DEFAULT 0,
	"applications_processed" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "progress_reports" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"student_id" varchar(255),
	"teacher_id" varchar(255),
	"booking_id" varchar(255),
	"report_data" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "property_groups" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"partnership_id" varchar(255),
	"address" text,
	"city" varchar(100),
	"state" varchar(100),
	"price" numeric(20, 2),
	"bedrooms" integer,
	"bathrooms" integer,
	"square_feet" integer,
	"description" text,
	"total_units" integer,
	"occupied_units" integer DEFAULT 0,
	"status" varchar(50) DEFAULT 'active',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "subject_videos" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"teacher_id" varchar(255),
	"title" varchar(255) NOT NULL,
	"description" text,
	"subject" varchar(255),
	"video_url" text,
	"thumbnail_url" text,
	"price" numeric(20, 2) DEFAULT '0',
	"subscribers" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"teacher_id" varchar(255),
	"plan" varchar(50) NOT NULL,
	"price" numeric(20, 2),
	"duration" integer,
	"status" varchar(50) DEFAULT 'active',
	"payment_method_id" varchar(255),
	"start_date" timestamp DEFAULT now(),
	"end_date" timestamp,
	"auto_renew" boolean DEFAULT true,
	"cancellation_requested_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "teacher_profiles" (
	"user_id" varchar(255) PRIMARY KEY NOT NULL,
	"base_hourly_rate" numeric(20, 2) DEFAULT '0',
	"total_earnings" numeric(20, 2) DEFAULT '0',
	"wallet_balance" numeric(20, 2) DEFAULT '0',
	"welfare_balance" numeric(20, 2) DEFAULT '0',
	"referral_welfare_boost" numeric(20, 2) DEFAULT '0',
	"rating_avg" numeric(3, 2) DEFAULT '0',
	"total_sessions" integer DEFAULT 0,
	"is_approved" boolean DEFAULT false,
	"search_rank" varchar(50) DEFAULT 'normal',
	"photo_url" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "teaching_materials" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"teacher_id" varchar(255),
	"title" varchar(255) NOT NULL,
	"description" text,
	"subject" varchar(255),
	"material_url" text,
	"content_type" varchar(50),
	"price" numeric(20, 2) DEFAULT '0',
	"downloads" integer DEFAULT 0,
	"purchasers" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"booking_id" varchar(255),
	"teacher_id" varchar(255),
	"amount" numeric(20, 2) NOT NULL,
	"type" varchar(50) NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"phone" varchar(50),
	"password_hash" text,
	"full_name" varchar(255) NOT NULL,
	"role" varchar(50) NOT NULL,
	"is_verified" boolean DEFAULT false,
	"trust_score" integer DEFAULT 0,
	"referral_code" varchar(50),
	"referral_count" integer DEFAULT 0,
	"referred_by" varchar(255),
	"referral_rewarded" boolean DEFAULT false,
	"photo_url" text,
	"bio" text,
	"average_monthly_earnings" numeric(20, 2) DEFAULT '0',
	"housing_eligible" boolean DEFAULT false,
	"housing_status" varchar(50) DEFAULT 'not-started',
	"has_active_mortgage" boolean DEFAULT false,
	"active_mortgage_id" varchar(255),
	"property_owned" boolean DEFAULT false,
	"is_premium" boolean DEFAULT false,
	"subscription_active" boolean DEFAULT false,
	"subscription_id" varchar(255),
	"subscription_plan" varchar(50),
	"subscription_end_date" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "users_referral_code_unique" UNIQUE("referral_code")
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
CREATE TABLE "video_access" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255),
	"video_id" varchar(255),
	"teacher_id" varchar(255),
	"price" numeric(20, 2),
	"transaction_id" varchar(255),
	"access_granted_at" timestamp DEFAULT now(),
	"expires_at" timestamp
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
	"cancelled_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "ambassadors" ADD CONSTRAINT "ambassadors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_parent_id_users_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digital_vault" ADD CONSTRAINT "digital_vault_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "earnings" ADD CONSTRAINT "earnings_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "housing_applications" ADD CONSTRAINT "housing_applications_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "housing_applications" ADD CONSTRAINT "housing_applications_property_id_housing_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."housing_properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "housing_eligibility" ADD CONSTRAINT "housing_eligibility_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "housing_milestones" ADD CONSTRAINT "housing_milestones_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "housing_properties" ADD CONSTRAINT "housing_properties_property_group_id_property_groups_id_fk" FOREIGN KEY ("property_group_id") REFERENCES "public"."property_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "housing_properties" ADD CONSTRAINT "housing_properties_partnership_id_partnerships_id_fk" FOREIGN KEY ("partnership_id") REFERENCES "public"."partnerships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "housing_properties" ADD CONSTRAINT "housing_properties_occupied_by_users_id_fk" FOREIGN KEY ("occupied_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_purchases" ADD CONSTRAINT "material_purchases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_purchases" ADD CONSTRAINT "material_purchases_material_id_teaching_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."teaching_materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_purchases" ADD CONSTRAINT "material_purchases_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missed_payments" ADD CONSTRAINT "missed_payments_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missed_payments" ADD CONSTRAINT "missed_payments_mortgage_id_mortgages_id_fk" FOREIGN KEY ("mortgage_id") REFERENCES "public"."mortgages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mortgage_payments" ADD CONSTRAINT "mortgage_payments_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mortgage_payments" ADD CONSTRAINT "mortgage_payments_mortgage_id_mortgages_id_fk" FOREIGN KEY ("mortgage_id") REFERENCES "public"."mortgages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mortgages" ADD CONSTRAINT "mortgages_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mortgages" ADD CONSTRAINT "mortgages_property_id_housing_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."housing_properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_profiles" ADD CONSTRAINT "parent_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_reports" ADD CONSTRAINT "progress_reports_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_reports" ADD CONSTRAINT "progress_reports_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_reports" ADD CONSTRAINT "progress_reports_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_groups" ADD CONSTRAINT "property_groups_partnership_id_partnerships_id_fk" FOREIGN KEY ("partnership_id") REFERENCES "public"."partnerships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_videos" ADD CONSTRAINT "subject_videos_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_materials" ADD CONSTRAINT "teaching_materials_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_purchases" ADD CONSTRAINT "vault_purchases_item_id_digital_vault_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."digital_vault"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_purchases" ADD CONSTRAINT "vault_purchases_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_access" ADD CONSTRAINT "video_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_access" ADD CONSTRAINT "video_access_video_id_subject_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."subject_videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_access" ADD CONSTRAINT "video_access_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_funds" ADD CONSTRAINT "welfare_funds_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
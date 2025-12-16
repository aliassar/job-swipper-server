-- Migration: Fix userId column types from text to uuid with proper foreign keys
-- This migration safely converts text userId columns to uuid type

-- Step 1: Add temporary UUID columns
ALTER TABLE "action_history" ADD COLUMN "user_id_uuid" uuid;
ALTER TABLE "applications" ADD COLUMN "user_id_uuid" uuid;
ALTER TABLE "generated_cover_letters" ADD COLUMN "user_id_uuid" uuid;
ALTER TABLE "generated_resumes" ADD COLUMN "user_id_uuid" uuid;
ALTER TABLE "reported_jobs" ADD COLUMN "user_id_uuid" uuid;
ALTER TABLE "resume_files" ADD COLUMN "user_id_uuid" uuid;
ALTER TABLE "user_job_status" ADD COLUMN "user_id_uuid" uuid;
ALTER TABLE "user_settings" ADD COLUMN "user_id_uuid" uuid;

--> statement-breakpoint

-- Step 2: Migrate existing data (convert text to uuid where valid)
-- Only migrates rows where user_id is a valid UUID format (case-insensitive)
UPDATE "action_history" SET "user_id_uuid" = "user_id"::uuid WHERE "user_id" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
UPDATE "applications" SET "user_id_uuid" = "user_id"::uuid WHERE "user_id" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
UPDATE "generated_cover_letters" SET "user_id_uuid" = "user_id"::uuid WHERE "user_id" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
UPDATE "generated_resumes" SET "user_id_uuid" = "user_id"::uuid WHERE "user_id" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
UPDATE "reported_jobs" SET "user_id_uuid" = "user_id"::uuid WHERE "user_id" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
UPDATE "resume_files" SET "user_id_uuid" = "user_id"::uuid WHERE "user_id" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
UPDATE "user_job_status" SET "user_id_uuid" = "user_id"::uuid WHERE "user_id" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
UPDATE "user_settings" SET "user_id_uuid" = "user_id"::uuid WHERE "user_id" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

--> statement-breakpoint

-- Step 3: Drop old text columns
ALTER TABLE "action_history" DROP COLUMN "user_id";
ALTER TABLE "applications" DROP COLUMN "user_id";
ALTER TABLE "generated_cover_letters" DROP COLUMN "user_id";
ALTER TABLE "generated_resumes" DROP COLUMN "user_id";
ALTER TABLE "reported_jobs" DROP COLUMN "user_id";
ALTER TABLE "resume_files" DROP COLUMN "user_id";
ALTER TABLE "user_job_status" DROP COLUMN "user_id";
ALTER TABLE "user_settings" DROP COLUMN "user_id";

--> statement-breakpoint

-- Step 4: Rename new uuid columns to original name
ALTER TABLE "action_history" RENAME COLUMN "user_id_uuid" TO "user_id";
ALTER TABLE "applications" RENAME COLUMN "user_id_uuid" TO "user_id";
ALTER TABLE "generated_cover_letters" RENAME COLUMN "user_id_uuid" TO "user_id";
ALTER TABLE "generated_resumes" RENAME COLUMN "user_id_uuid" TO "user_id";
ALTER TABLE "reported_jobs" RENAME COLUMN "user_id_uuid" TO "user_id";
ALTER TABLE "resume_files" RENAME COLUMN "user_id_uuid" TO "user_id";
ALTER TABLE "user_job_status" RENAME COLUMN "user_id_uuid" TO "user_id";
ALTER TABLE "user_settings" RENAME COLUMN "user_id_uuid" TO "user_id";

--> statement-breakpoint

-- Step 5: Add NOT NULL constraints
ALTER TABLE "action_history" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "applications" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "generated_cover_letters" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "generated_resumes" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "reported_jobs" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "resume_files" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "user_job_status" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "user_settings" ALTER COLUMN "user_id" SET NOT NULL;

--> statement-breakpoint

-- Step 6: Add foreign key constraints
DO $$ BEGIN
 ALTER TABLE "action_history" ADD CONSTRAINT "action_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "applications" ADD CONSTRAINT "applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "generated_cover_letters" ADD CONSTRAINT "generated_cover_letters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "generated_resumes" ADD CONSTRAINT "generated_resumes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reported_jobs" ADD CONSTRAINT "reported_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "resume_files" ADD CONSTRAINT "resume_files_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_job_status" ADD CONSTRAINT "user_job_status_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Step 7: Add UNIQUE constraint back to user_settings.user_id
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_unique" UNIQUE("user_id");


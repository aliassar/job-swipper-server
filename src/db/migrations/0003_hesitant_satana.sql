ALTER TABLE "email_connections" ADD COLUMN "encrypted_access_token" text;--> statement-breakpoint
ALTER TABLE "email_connections" ADD COLUMN "encrypted_refresh_token" text;--> statement-breakpoint
ALTER TABLE "email_connections" ADD COLUMN "encrypted_imap_password" text;--> statement-breakpoint
ALTER TABLE "email_connections" ADD COLUMN "encryption_iv" text;
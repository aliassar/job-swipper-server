-- Add idempotency_keys table for preventing duplicate requests
CREATE TABLE IF NOT EXISTS "idempotency_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" text NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "response" jsonb NOT NULL,
  "status_code" integer NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Create unique index on user_id + key combination
CREATE UNIQUE INDEX IF NOT EXISTS "idempotency_keys_user_id_key_unique" ON "idempotency_keys" ("user_id", "key");

-- Create index on expires_at for cleanup job
CREATE INDEX IF NOT EXISTS "idempotency_keys_expires_at_idx" ON "idempotency_keys" ("expires_at");

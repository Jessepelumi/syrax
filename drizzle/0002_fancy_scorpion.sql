ALTER TABLE "upload_files" ADD COLUMN "provider_session_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "upload_files" ADD COLUMN "session_creation_lease" text;--> statement-breakpoint
ALTER TABLE "upload_files" ADD COLUMN "session_creation_lease_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "upload_files_session_lease_expiry_idx" ON "upload_files" USING btree ("session_creation_lease_expires_at");
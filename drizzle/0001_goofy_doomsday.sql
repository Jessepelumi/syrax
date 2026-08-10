CREATE TYPE "public"."portal_status" AS ENUM('DRAFT', 'OPEN', 'CLOSED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('CREATED', 'UPLOADING', 'VERIFYING', 'COMPLETED', 'PARTIAL', 'FAILED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."upload_file_state" AS ENUM('CREATED', 'SESSION_READY', 'UPLOADING', 'RETRY_WAIT', 'VERIFYING', 'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED');--> statement-breakpoint
CREATE TABLE "portals" (
	"id" text PRIMARY KEY NOT NULL,
	"destination_id" text NOT NULL,
	"name" text NOT NULL,
	"public_token_hash" text NOT NULL,
	"status" "portal_status" DEFAULT 'DRAFT' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"allowed_mime_types" text[] NOT NULL,
	"max_file_size_bytes" bigint NOT NULL,
	"max_files_per_submission" integer NOT NULL,
	"max_submission_bytes" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portals_allowed_mime_types_nonempty" CHECK (cardinality("portals"."allowed_mime_types") > 0),
	CONSTRAINT "portals_max_file_size_positive" CHECK ("portals"."max_file_size_bytes" > 0),
	CONSTRAINT "portals_max_files_per_submission_positive" CHECK ("portals"."max_files_per_submission" > 0),
	CONSTRAINT "portals_max_submission_size_valid" CHECK ("portals"."max_submission_bytes" >= "portals"."max_file_size_bytes")
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_id" text NOT NULL,
	"status" "submission_status" DEFAULT 'CREATED' NOT NULL,
	"guest_name" text,
	"file_count" integer NOT NULL,
	"total_declared_bytes" bigint NOT NULL,
	"completed_files" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "submissions_file_count_positive" CHECK ("submissions"."file_count" > 0),
	CONSTRAINT "submissions_total_declared_bytes_positive" CHECK ("submissions"."total_declared_bytes" > 0),
	CONSTRAINT "submissions_completed_files_nonnegative" CHECK ("submissions"."completed_files" >= 0),
	CONSTRAINT "submissions_completed_files_within_count" CHECK ("submissions"."completed_files" <= "submissions"."file_count"),
	CONSTRAINT "submissions_version_nonnegative" CHECK ("submissions"."version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "upload_files" (
	"id" text PRIMARY KEY NOT NULL,
	"submission_id" text NOT NULL,
	"client_file_id" text NOT NULL,
	"original_name" text NOT NULL,
	"destination_name" text NOT NULL,
	"declared_mime_type" text NOT NULL,
	"declared_size_bytes" bigint NOT NULL,
	"state" "upload_file_state" DEFAULT 'CREATED' NOT NULL,
	"provider_file_id" text,
	"provider_session_ref" text,
	"bytes_confirmed" bigint DEFAULT 0 NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error_code" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "upload_files_declared_size_positive" CHECK ("upload_files"."declared_size_bytes" > 0),
	CONSTRAINT "upload_files_bytes_confirmed_nonnegative" CHECK ("upload_files"."bytes_confirmed" >= 0),
	CONSTRAINT "upload_files_bytes_confirmed_within_size" CHECK ("upload_files"."bytes_confirmed" <= "upload_files"."declared_size_bytes"),
	CONSTRAINT "upload_files_attempt_count_nonnegative" CHECK ("upload_files"."attempt_count" >= 0),
	CONSTRAINT "upload_files_version_nonnegative" CHECK ("upload_files"."version" >= 0)
);
--> statement-breakpoint
DROP INDEX "drive_destinations_connection_unique";--> statement-breakpoint
ALTER TABLE "portals" ADD CONSTRAINT "portals_destination_id_drive_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."drive_destinations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_portal_id_portals_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_files" ADD CONSTRAINT "upload_files_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "portals_public_token_hash_unique" ON "portals" USING btree ("public_token_hash");--> statement-breakpoint
CREATE INDEX "portals_destination_created_idx" ON "portals" USING btree ("destination_id","created_at");--> statement-breakpoint
CREATE INDEX "portals_status_expires_idx" ON "portals" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "submissions_portal_created_idx" ON "submissions" USING btree ("portal_id","created_at");--> statement-breakpoint
CREATE INDEX "submissions_status_updated_idx" ON "submissions" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "upload_files_submission_client_unique" ON "upload_files" USING btree ("submission_id","client_file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "upload_files_destination_name_unique" ON "upload_files" USING btree ("destination_name");--> statement-breakpoint
CREATE UNIQUE INDEX "upload_files_provider_file_unique" ON "upload_files" USING btree ("provider_file_id");--> statement-breakpoint
CREATE INDEX "upload_files_submission_state_idx" ON "upload_files" USING btree ("submission_id","state");--> statement-breakpoint
CREATE INDEX "audit_events_resource_created_idx" ON "audit_events" USING btree ("resource_type","resource_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_type_created_idx" ON "audit_events" USING btree ("event_type","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "drive_destinations_connection_folder_unique" ON "drive_destinations" USING btree ("drive_connection_id","provider_folder_id");--> statement-breakpoint
CREATE INDEX "drive_destinations_connection_updated_idx" ON "drive_destinations" USING btree ("drive_connection_id","updated_at");
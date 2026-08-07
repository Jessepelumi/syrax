CREATE TYPE "public"."audit_actor_type" AS ENUM('ADMIN', 'GUEST', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."drive_connection_status" AS ENUM('ACTIVE', 'REVOKED', 'ERROR');--> statement-breakpoint
CREATE TYPE "public"."drive_destination_status" AS ENUM('ACTIVE', 'INVALID', 'DISCONNECTED');--> statement-breakpoint
CREATE TABLE "admins" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"google_subject" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_type" "audit_actor_type" NOT NULL,
	"actor_id" text,
	"event_type" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drive_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_id" text NOT NULL,
	"encrypted_refresh_token" text NOT NULL,
	"granted_scopes" text[] NOT NULL,
	"token_version" text DEFAULT 'v1' NOT NULL,
	"status" "drive_connection_status" DEFAULT 'ACTIVE' NOT NULL,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drive_destinations" (
	"id" text PRIMARY KEY NOT NULL,
	"drive_connection_id" text NOT NULL,
	"provider_folder_id" text NOT NULL,
	"display_name" text NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	"status" "drive_destination_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drive_connections" ADD CONSTRAINT "drive_connections_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_destinations" ADD CONSTRAINT "drive_destinations_drive_connection_id_drive_connections_id_fk" FOREIGN KEY ("drive_connection_id") REFERENCES "public"."drive_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admins_email_unique" ON "admins" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "admins_google_subject_unique" ON "admins" USING btree ("google_subject");--> statement-breakpoint
CREATE UNIQUE INDEX "drive_connections_admin_unique" ON "drive_connections" USING btree ("admin_id");--> statement-breakpoint
CREATE UNIQUE INDEX "drive_destinations_connection_unique" ON "drive_destinations" USING btree ("drive_connection_id");
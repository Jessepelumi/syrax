ALTER TABLE "submissions" DROP CONSTRAINT "submissions_portal_id_portals_id_fk";
--> statement-breakpoint
ALTER TABLE "drive_destinations" ADD COLUMN "selected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_portal_id_portals_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "drive_destinations_connection_selected_unique" ON "drive_destinations" USING btree ("drive_connection_id") WHERE "drive_destinations"."selected_at" is not null;
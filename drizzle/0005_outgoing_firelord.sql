ALTER TABLE "portals" ADD COLUMN "max_image_file_size_bytes" bigint DEFAULT 31457280 NOT NULL;--> statement-breakpoint
ALTER TABLE "portals" ADD COLUMN "max_video_file_size_bytes" bigint DEFAULT 104857600 NOT NULL;--> statement-breakpoint
UPDATE "portals"
SET
	"allowed_mime_types" = ARRAY(
		SELECT DISTINCT "mime_type"
		FROM unnest("allowed_mime_types" || ARRAY['video/mp4', 'video/quicktime']::text[]) AS "allowed"("mime_type")
		ORDER BY "mime_type"
	),
	"max_file_size_bytes" = 104857600,
	"max_image_file_size_bytes" = 31457280,
	"max_video_file_size_bytes" = 104857600;--> statement-breakpoint
ALTER TABLE "portals" ADD CONSTRAINT "portals_max_image_file_size_positive" CHECK ("portals"."max_image_file_size_bytes" > 0);--> statement-breakpoint
ALTER TABLE "portals" ADD CONSTRAINT "portals_max_video_file_size_positive" CHECK ("portals"."max_video_file_size_bytes" > 0);--> statement-breakpoint
ALTER TABLE "portals" ADD CONSTRAINT "portals_max_submission_image_size_valid" CHECK ("portals"."max_submission_bytes" >= "portals"."max_image_file_size_bytes");--> statement-breakpoint
ALTER TABLE "portals" ADD CONSTRAINT "portals_max_submission_video_size_valid" CHECK ("portals"."max_submission_bytes" >= "portals"."max_video_file_size_bytes");

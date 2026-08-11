ALTER TABLE "portals" ALTER COLUMN "max_image_file_size_bytes" SET DEFAULT 104857600;--> statement-breakpoint
ALTER TABLE "portals" ALTER COLUMN "max_video_file_size_bytes" SET DEFAULT 2147483648;--> statement-breakpoint
ALTER TABLE "portals" ADD COLUMN "max_image_bytes_per_submission" bigint DEFAULT 1610612736 NOT NULL;--> statement-breakpoint
ALTER TABLE "portals" ADD COLUMN "max_video_bytes_per_submission" bigint DEFAULT 2147483648 NOT NULL;--> statement-breakpoint
UPDATE "portals"
SET
	"max_file_size_bytes" = 2147483648,
	"max_image_file_size_bytes" = 104857600,
	"max_video_file_size_bytes" = 2147483648,
	"max_image_bytes_per_submission" = 1610612736,
	"max_video_bytes_per_submission" = 2147483648,
	"max_submission_bytes" = 3758096384;--> statement-breakpoint
ALTER TABLE "portals" ADD CONSTRAINT "portals_max_image_submission_size_valid" CHECK ("portals"."max_image_bytes_per_submission" >= "portals"."max_image_file_size_bytes");--> statement-breakpoint
ALTER TABLE "portals" ADD CONSTRAINT "portals_max_video_submission_size_valid" CHECK ("portals"."max_video_bytes_per_submission" >= "portals"."max_video_file_size_bytes");--> statement-breakpoint
ALTER TABLE "portals" ADD CONSTRAINT "portals_max_submission_category_sizes_valid" CHECK ("portals"."max_submission_bytes" >= "portals"."max_image_bytes_per_submission" + "portals"."max_video_bytes_per_submission");

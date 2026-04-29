ALTER TABLE `video_transcripts` ADD COLUMN `fetch_status` text DEFAULT 'ok';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `video_transcripts_status_idx` ON `video_transcripts` (`video_id`, `fetch_status`);

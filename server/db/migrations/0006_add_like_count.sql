-- Manual migration to fix missing column
ALTER TABLE `videos` ADD COLUMN `like_count` integer DEFAULT 0;
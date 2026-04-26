CREATE TABLE IF NOT EXISTS `agent_chats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL DEFAULT 'New conversation',
	`message_count` integer DEFAULT 0,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS `agent_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chat_id` integer NOT NULL REFERENCES `agent_chats`(`id`) ON DELETE CASCADE,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`metadata` text,
	`created_at` text DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS `agent_messages_chat_idx` ON `agent_messages` (`chat_id`);

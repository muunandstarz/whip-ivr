CREATE TABLE `klutch_signoff_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`from_revision` int NOT NULL,
	`to_revision` int NOT NULL,
	`previous_name` varchar(255) NOT NULL,
	`previous_title` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`title` varchar(255) NOT NULL,
	`actor_user_id` int NOT NULL,
	`actor_open_id` varchar(64) NOT NULL,
	`actor_name` varchar(255) NOT NULL,
	`occurred_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `klutch_signoff_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `klutch_signoff_events_revision_uq` UNIQUE(`to_revision`)
);
--> statement-breakpoint
CREATE TABLE `klutch_signoff_settings` (
	`id` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`title` varchar(255) NOT NULL,
	`revision` int NOT NULL,
	`updated_by_user_id` int NOT NULL,
	`updated_by_open_id` varchar(64) NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `klutch_signoff_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `klutch_signoff_events_actor_idx` ON `klutch_signoff_events` (`actor_user_id`,`occurred_at`);
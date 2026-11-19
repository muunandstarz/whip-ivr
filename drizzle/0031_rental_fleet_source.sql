ALTER TABLE `rental_vehicles` ADD `source` varchar(16) DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `rental_vehicles` ADD `sourceAvailable` boolean;--> statement-breakpoint
ALTER TABLE `rental_vehicles` ADD `sourceStatus` varchar(24);--> statement-breakpoint
ALTER TABLE `rental_vehicles` ADD `sourceCheckedAt` bigint;--> statement-breakpoint
ALTER TABLE `rental_vehicles` ADD `sourceRow` int;--> statement-breakpoint
ALTER TABLE `rental_vehicles` ADD `sourceLocationIssue` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `rental_vehicles` ADD `isDemo` boolean DEFAULT false NOT NULL;
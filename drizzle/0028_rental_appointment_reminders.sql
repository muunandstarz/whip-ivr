CREATE TABLE `rental_reminder_config` (
	`id` int NOT NULL DEFAULT 1,
	`enabled` boolean NOT NULL DEFAULT false,
	`aircallNumberId` int NOT NULL DEFAULT 0,
	`carrierApproved` boolean NOT NULL DEFAULT false,
	`scheduleCronTaskUid` varchar(65),
	`webhookTokenPayload` text,
	`lastRunAt` bigint,
	`lastError` varchar(80),
	`updatedAt` bigint NOT NULL DEFAULT 0,
	CONSTRAINT `rental_reminder_config_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rental_reminder_deliveries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rentalId` int NOT NULL,
	`appointmentKey` varchar(64) NOT NULL,
	`kind` enum('24h','2h') NOT NULL,
	`state` enum('pending','accepted','sent','delivered','failed','uncertain','skipped') NOT NULL DEFAULT 'pending',
	`aircallNumberId` int NOT NULL,
	`recipientPhoneHash` varchar(64) NOT NULL,
	`recipientPayload` text NOT NULL,
	`messagePayload` text NOT NULL,
	`appointmentAt` bigint NOT NULL,
	`dueAt` bigint NOT NULL,
	`reservationToken` varchar(36) NOT NULL,
	`providerId` varchar(120),
	`errorCode` varchar(80),
	`createdAt` bigint NOT NULL,
	`dispatchAt` bigint,
	`updatedAt` bigint NOT NULL,
	`providerEventAt` bigint,
	CONSTRAINT `rental_reminder_deliveries_id` PRIMARY KEY(`id`),
	CONSTRAINT `rental_reminder_slot_uq` UNIQUE(`rentalId`,`appointmentKey`,`kind`)
);
--> statement-breakpoint
CREATE TABLE `rental_reminder_subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rentalId` int NOT NULL,
	`enabled` boolean NOT NULL DEFAULT false,
	`consentAt` bigint,
	`consentBy` varchar(100),
	`consentPhoneHash` varchar(64),
	`appointmentCanceled` boolean NOT NULL DEFAULT false,
	`lastEvaluatedAt` bigint NOT NULL DEFAULT 0,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `rental_reminder_subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `rental_reminder_subscriptions_rentalId_unique` UNIQUE(`rentalId`)
);
--> statement-breakpoint
CREATE TABLE `rental_reminder_suppressions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`phoneHash` varchar(64) NOT NULL,
	`reason` varchar(16) NOT NULL DEFAULT 'STOP',
	`createdAt` bigint NOT NULL,
	CONSTRAINT `rental_reminder_suppressions_id` PRIMARY KEY(`id`),
	CONSTRAINT `rental_reminder_suppressions_phoneHash_unique` UNIQUE(`phoneHash`)
);
--> statement-breakpoint
CREATE INDEX `rental_reminder_cron_idx` ON `rental_reminder_config` (`scheduleCronTaskUid`);--> statement-breakpoint
CREATE INDEX `rental_reminder_provider_idx` ON `rental_reminder_deliveries` (`providerId`,`aircallNumberId`);--> statement-breakpoint
CREATE INDEX `rental_reminder_pending_idx` ON `rental_reminder_deliveries` (`state`,`createdAt`);--> statement-breakpoint
CREATE INDEX `rental_reminder_scan_idx` ON `rental_reminder_subscriptions` (`enabled`,`lastEvaluatedAt`);
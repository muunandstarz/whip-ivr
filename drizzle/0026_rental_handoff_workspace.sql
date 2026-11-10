CREATE TABLE `rental_assets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rentalId` int NOT NULL,
	`kind` varchar(40) NOT NULL,
	`storageKey` text NOT NULL,
	`mime` varchar(40) NOT NULL,
	`signerName` varchar(120),
	`uploadedBy` varchar(100) NOT NULL,
	`createdAt` bigint NOT NULL,
	`device` varchar(250),
	`ipHash` varchar(64),
	CONSTRAINT `rental_assets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rental_audit` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rentalId` int,
	`actorKey` varchar(100) NOT NULL,
	`actorName` varchar(120) NOT NULL,
	`action` varchar(100) NOT NULL,
	`detail` text NOT NULL,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `rental_audit_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rental_email_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rentalId` int NOT NULL,
	`packetId` int NOT NULL,
	`recipient` text NOT NULL,
	`status` varchar(16) NOT NULL,
	`providerId` varchar(120),
	`error` text,
	`requestId` varchar(80) NOT NULL,
	`createdBy` varchar(100) NOT NULL,
	`createdAt` bigint NOT NULL,
	`sentAt` bigint,
	CONSTRAINT `rental_email_log_id` PRIMARY KEY(`id`),
	CONSTRAINT `rental_email_log_requestId_unique` UNIQUE(`requestId`)
);
--> statement-breakpoint
CREATE TABLE `rental_locations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`address` text NOT NULL,
	`phone` varchar(40) NOT NULL,
	`timezone` varchar(60) NOT NULL DEFAULT 'America/New_York',
	`active` boolean NOT NULL DEFAULT true,
	CONSTRAINT `rental_locations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rental_packets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rentalId` int NOT NULL,
	`version` int NOT NULL,
	`kind` varchar(20) NOT NULL,
	`storageKey` text NOT NULL,
	`snapshot` text NOT NULL,
	`createdBy` varchar(100) NOT NULL,
	`createdAt` bigint NOT NULL,
	`formVersion` varchar(60) NOT NULL,
	`requestId` varchar(80) NOT NULL,
	CONSTRAINT `rental_packets_id` PRIMARY KEY(`id`),
	CONSTRAINT `rental_packets_requestId_unique` UNIQUE(`requestId`),
	CONSTRAINT `rental_packet_version_idx` UNIQUE(`rentalId`,`version`)
);
--> statement-breakpoint
CREATE TABLE `rental_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`status` varchar(16) NOT NULL DEFAULT 'Scheduled',
	`locationId` int NOT NULL,
	`vehicleId` int NOT NULL,
	`renterNameSearch` varchar(180) NOT NULL,
	`rentalVinLastSix` varchar(6) NOT NULL,
	`renterVinLastSix` varchar(6) NOT NULL,
	`claimNumber` varchar(80) NOT NULL,
	`plateSearch` varchar(80) NOT NULL,
	`payload` text NOT NULL,
	`revision` int NOT NULL DEFAULT 1,
	`activePacketId` int,
	`returnPayload` text,
	`rateSnapshot` text NOT NULL,
	`createdBy` varchar(100) NOT NULL,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `rental_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rental_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tokenHash` varchar(64) NOT NULL,
	`shopUserId` int NOT NULL,
	`expiresAt` bigint NOT NULL,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `rental_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `rental_sessions_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `rental_settings` (
	`id` int NOT NULL,
	`payload` text NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `rental_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rental_shop_users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(254) NOT NULL,
	`name` varchar(120) NOT NULL,
	`passwordHash` text,
	`locationIds` text NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`activationHash` varchar(64),
	`activationExpires` bigint,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `rental_shop_users_id` PRIMARY KEY(`id`),
	CONSTRAINT `rental_shop_users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `rental_vehicles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`locationId` int NOT NULL,
	`ymm` varchar(120) NOT NULL,
	`vin` varchar(17) NOT NULL,
	`plate` varchar(30) NOT NULL,
	`lastOdometer` int NOT NULL DEFAULT 0,
	`active` boolean NOT NULL DEFAULT true,
	CONSTRAINT `rental_vehicles_id` PRIMARY KEY(`id`),
	CONSTRAINT `rental_vehicles_vin_unique` UNIQUE(`vin`)
);
--> statement-breakpoint
CREATE INDEX `rental_asset_record_idx` ON `rental_assets` (`rentalId`);--> statement-breakpoint
CREATE INDEX `rental_name_idx` ON `rental_records` (`renterNameSearch`);--> statement-breakpoint
CREATE INDEX `rental_vin_idx` ON `rental_records` (`rentalVinLastSix`);--> statement-breakpoint
CREATE INDEX `renter_vin_idx` ON `rental_records` (`renterVinLastSix`);--> statement-breakpoint
CREATE INDEX `rental_claim_idx` ON `rental_records` (`claimNumber`);--> statement-breakpoint
CREATE INDEX `rental_location_status_idx` ON `rental_records` (`locationId`,`status`);--> statement-breakpoint
CREATE INDEX `rental_vehicle_location_idx` ON `rental_vehicles` (`locationId`);
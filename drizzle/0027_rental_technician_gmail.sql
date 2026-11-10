CREATE TABLE `rental_oauth_states` (
	`id` int AUTO_INCREMENT NOT NULL,
	`stateHash` varchar(64) NOT NULL,
	`actorKey` varchar(100) NOT NULL,
	`redirectUri` varchar(300) NOT NULL,
	`expiresAt` bigint NOT NULL,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `rental_oauth_states_id` PRIMARY KEY(`id`),
	CONSTRAINT `rental_oauth_states_stateHash_unique` UNIQUE(`stateHash`)
);
--> statement-breakpoint
CREATE TABLE `rental_sender_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actorKey` varchar(100) NOT NULL,
	`email` varchar(254) NOT NULL,
	`tokenPayload` text NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `rental_sender_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `rental_sender_tokens_actorKey_unique` UNIQUE(`actorKey`)
);

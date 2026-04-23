CREATE TABLE `call_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`callSid` varchar(64) NOT NULL,
	`callerPhone` varchar(32),
	`state` varchar(64) NOT NULL DEFAULT 'greeting',
	`collectedData` json,
	`conversationHistory` json,
	`callerType` enum('carrier','law_office','medical_provider','member','claimant','police','wrong_department','unknown') DEFAULT 'unknown',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `call_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `call_sessions_callSid_unique` UNIQUE(`callSid`)
);
--> statement-breakpoint
CREATE TABLE `intake_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`callSid` varchar(64),
	`callerPhone` varchar(32),
	`callerType` enum('carrier','law_office','medical_provider','member','claimant','police','wrong_department','unknown') NOT NULL DEFAULT 'unknown',
	`callerName` varchar(256),
	`organization` varchar(256),
	`whipClaimNumber` varchar(128),
	`callerReferenceNumber` varchar(128),
	`callPurpose` varchar(512),
	`message` text,
	`callbackPhone` varchar(32),
	`callbackEmail` varchar(320),
	`assignedHandler` varchar(256),
	`status` enum('open','closed') NOT NULL DEFAULT 'open',
	`transcript` text,
	`source` enum('ai_ivr','voicemail','manual') NOT NULL DEFAULT 'ai_ivr',
	`notificationSent` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `intake_records_id` PRIMARY KEY(`id`)
);

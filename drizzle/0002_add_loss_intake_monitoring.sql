CREATE TABLE IF NOT EXISTS `loss_intake_claims` (
  `id` int AUTO_INCREMENT NOT NULL,
  `slackKey` varchar(128) NOT NULL,
  `channelId` varchar(32) NOT NULL,
  `channelName` varchar(128) NOT NULL,
  `slackMessageTs` varchar(32) NOT NULL,
  `slackPermalink` text,
  `postedAt` timestamp NOT NULL,
  `memberName` varchar(255),
  `customerId` varchar(128),
  `vinLastSix` varchar(16),
  `market` varchar(128),
  `vehicleType` enum('gas','ev_tesla','unknown') NOT NULL DEFAULT 'unknown',
  `assignedHandlerId` int,
  `assignedAgent` varchar(128),
  `stage` enum('awaiting_outreach','outreach_started','contact_attempts','complete') NOT NULL DEFAULT 'awaiting_outreach',
  `hasPhotos` boolean NOT NULL DEFAULT false,
  `attachmentCount` int NOT NULL DEFAULT 0,
  `firstContactAt` timestamp NULL,
  `firstContactMinutes` float,
  `slaState` enum('within_sla','at_risk','breached') NOT NULL DEFAULT 'within_sla',
  `completedAt` timestamp NULL,
  `intakeCycleMinutes` float,
  `factsOfLoss` text,
  `preliminaryLiability` text,
  `rideshareStatus` varchar(255),
  `noAnswerAttempts` int NOT NULL DEFAULT 0,
  `teslaFootageRequested` boolean,
  `qualityScore` float,
  `missingElements` text DEFAULT NULL,
  `lastSyncedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `loss_intake_claims_id` PRIMARY KEY (`id`),
  CONSTRAINT `loss_intake_claims_slackKey_unique` UNIQUE (`slackKey`)
);

CREATE TABLE IF NOT EXISTS `loss_intake_events` (
  `id` int AUTO_INCREMENT NOT NULL,
  `slackEventKey` varchar(128) NOT NULL,
  `claimId` int NOT NULL,
  `slackEventTs` varchar(32) NOT NULL,
  `occurredAt` timestamp NOT NULL,
  `actorSlackUserId` varchar(32),
  `actorName` varchar(128),
  `eventType` enum('posted','acknowledgment','contact_attempt','completion','other') NOT NULL,
  `body` text,
  `metadata` json,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `loss_intake_events_id` PRIMARY KEY (`id`),
  CONSTRAINT `loss_intake_events_slackEventKey_unique` UNIQUE (`slackEventKey`)
);

CREATE TABLE IF NOT EXISTS `loss_intake_quality_items` (
  `id` int AUTO_INCREMENT NOT NULL,
  `claimId` int NOT NULL,
  `criterion` varchar(64) NOT NULL,
  `result` enum('pass','fail','not_applicable') NOT NULL,
  `points` float NOT NULL DEFAULT 0,
  `maxPoints` float NOT NULL DEFAULT 0,
  `evidence` text,
  `sourceEventId` int,
  `coachingNote` text,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `loss_intake_quality_items_id` PRIMARY KEY (`id`)
);

CREATE TABLE IF NOT EXISTS `loss_intake_qas` (
  `id` int AUTO_INCREMENT NOT NULL,
  `claimId` int NOT NULL,
  `handlerId` int NOT NULL,
  `handlerName` varchar(128) NOT NULL,
  `status` enum('draft','reviewed','sent','opened','acknowledged','resolved') NOT NULL DEFAULT 'draft',
  `overallScore` float,
  `strengths` text,
  `coachingOpportunities` text,
  `managerComments` text,
  `repResponse` text,
  `createdBy` varchar(255),
  `draftedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reviewedAt` timestamp NULL,
  `sentAt` timestamp NULL,
  `openedAt` timestamp NULL,
  `acknowledgedAt` timestamp NULL,
  `resolvedAt` timestamp NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `loss_intake_qas_id` PRIMARY KEY (`id`)
);

CREATE TABLE IF NOT EXISTS `loss_intake_settings` (
  `id` int AUTO_INCREMENT NOT NULL,
  `configKey` varchar(64) NOT NULL,
  `claimsChannelId` varchar(32) NOT NULL DEFAULT 'CHWRXH4HK',
  `remoteMarketsChannelId` varchar(32) NOT NULL DEFAULT 'C092UPKR79D',
  `firstContactSlaMinutes` int NOT NULL DEFAULT 10,
  `atRiskMinutes` int NOT NULL DEFAULT 7,
  `qaDueHours` int NOT NULL DEFAULT 24,
  `scoringWeights` json,
  `agentAssignments` json,
  `scheduleCronTaskUid` varchar(65),
  `lastSuccessfulSyncAt` timestamp NULL,
  `lastSyncError` text,
  `updatedBy` varchar(255),
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `loss_intake_settings_id` PRIMARY KEY (`id`),
  CONSTRAINT `loss_intake_settings_configKey_unique` UNIQUE (`configKey`)
);

CREATE TABLE IF NOT EXISTS `loss_intake_sync_runs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `status` enum('running','success','failed') NOT NULL DEFAULT 'running',
  `claimsDiscovered` int NOT NULL DEFAULT 0,
  `claimsUpdated` int NOT NULL DEFAULT 0,
  `eventsProcessed` int NOT NULL DEFAULT 0,
  `errorMessage` text,
  `startedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completedAt` timestamp NULL,
  CONSTRAINT `loss_intake_sync_runs_id` PRIMARY KEY (`id`)
);

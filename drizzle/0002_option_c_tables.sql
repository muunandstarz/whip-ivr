-- Drop old call_sessions table (replaced by call_history)
DROP TABLE IF EXISTS `call_sessions`;

-- Handlers table
CREATE TABLE IF NOT EXISTS `handlers` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `name` varchar(128) NOT NULL,
  `email` varchar(320),
  `role` varchar(64),
  `aircallUserId` int,
  `active` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT (now())
);

-- Caller profiles for repeat caller tracking
CREATE TABLE IF NOT EXISTS `caller_profiles` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `phone` varchar(32) NOT NULL UNIQUE,
  `name` varchar(256),
  `org` varchar(256),
  `callerType` enum('carrier','law_office','medical_provider','member','claimant','police','unknown') DEFAULT 'unknown',
  `totalCalls` int NOT NULL DEFAULT 1,
  `lastCallAt` timestamp NOT NULL DEFAULT (now()),
  `claimNumbers` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE (now())
);

-- Full call history from Aircall
CREATE TABLE IF NOT EXISTS `call_history` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `aircallCallId` varchar(64) NOT NULL UNIQUE,
  `direction` enum('inbound','outbound') NOT NULL,
  `status` enum('answered','missed','voicemail','transferred','abandoned') NOT NULL,
  `callerPhone` varchar(32),
  `callerName` varchar(256),
  `aircallNumberId` int,
  `aircallNumberName` varchar(128),
  `agentId` int,
  `agentName` varchar(128),
  `handlerId` int,
  `durationSeconds` int DEFAULT 0,
  `waitTimeSeconds` int DEFAULT 0,
  `recordingUrl` text,
  `voicemailUrl` text,
  `hasIntakeRecord` boolean DEFAULT false,
  `intakeRecordId` int,
  `startedAt` timestamp NOT NULL,
  `endedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT (now())
);

-- QA scores per call
CREATE TABLE IF NOT EXISTS `qa_scores` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `callHistoryId` int NOT NULL,
  `aircallCallId` varchar(64) NOT NULL,
  `agentId` int,
  `agentName` varchar(128),
  `handlerId` int,
  `weekOf` timestamp NOT NULL,
  `transcript` text,
  `greetingScore` float,
  `holdManagementScore` float,
  `resolutionScore` float,
  `empathyScore` float,
  `callControlScore` float,
  `overallScore` float,
  `improvementNotes` text,
  `strengths` text,
  `rawAiResponse` text,
  `createdAt` timestamp NOT NULL DEFAULT (now())
);

-- Update intake_records to match new schema (add missing columns if not exist)
ALTER TABLE `intake_records`
  MODIFY COLUMN `callerType` enum('carrier','law_office','medical_provider','member','claimant','police','unknown') DEFAULT 'unknown',
  MODIFY COLUMN `status` enum('open','closed','escalated') NOT NULL DEFAULT 'open',
  MODIFY COLUMN `priority` enum('normal','high','urgent') NOT NULL DEFAULT 'normal',
  MODIFY COLUMN `source` enum('voicemail','manual','live_call') NOT NULL DEFAULT 'voicemail';


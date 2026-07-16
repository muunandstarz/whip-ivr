-- Migration: 0003_loss_intake_enhancements
-- Adds dateOfLoss, templatePostedAt, templatePostMinutesFromContact,
-- templatePostMinutesFromReport, contactAttempts to loss_intake_claims

ALTER TABLE `loss_intake_claims`
  ADD COLUMN `contactAttempts` int NOT NULL DEFAULT 0 AFTER `noAnswerAttempts`,
  ADD COLUMN `dateOfLoss` varchar(64) AFTER `contactAttempts`,
  ADD COLUMN `templatePostedAt` timestamp AFTER `dateOfLoss`,
  ADD COLUMN `templatePostMinutesFromContact` float AFTER `templatePostedAt`,
  ADD COLUMN `templatePostMinutesFromReport` float AFTER `templatePostMinutesFromContact`;

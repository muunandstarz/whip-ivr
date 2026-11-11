-- ADDITIVE migration after already-applied 0028_rental_appointment_reminders.sql.
-- Reviewed: no rental records/packets/consent rows changed or deleted; no legacy
-- Aircall values reinterpreted as Textline configuration. Existing approval never
-- enables Textline: all new readiness fields default false/null. Apply once through
-- the project's explicit migration runner; do not rewrite/reapply 0028.
ALTER TABLE `rental_reminder_config`
  ADD COLUMN `textlineDepartmentUuid` varchar(36) NULL,
  ADD COLUMN `textlineDepartmentVerified` boolean NOT NULL DEFAULT false,
  ADD COLUMN `textlineDepartmentName` varchar(160) NULL,
  ADD COLUMN `textlineSenderPhone` varchar(20) NULL,
  ADD COLUMN `textlineWebhooksConfirmed` boolean NOT NULL DEFAULT false,
  ADD COLUMN `textlineAccessTokenPayload` text NULL,
  ADD COLUMN `textlineWebhookCapabilityPayload` text NULL,
  ADD COLUMN `textlineWebhookSecretPayload` text NULL,
  ADD COLUMN `textlineWebhookSecretHash` varchar(64) NULL;
--> statement-breakpoint
-- Keep old sender IDs and their index for historical logs. New Textline writes use 0.
ALTER TABLE `rental_reminder_deliveries`
  ALTER COLUMN `aircallNumberId` SET DEFAULT 0,
  ADD COLUMN `provider` varchar(24) NULL,
  ADD COLUMN `textlineDepartmentUuid` varchar(36) NULL,
  ADD COLUMN `textlineConversationUuid` varchar(36) NULL,
  ADD COLUMN `textlineCustomerUuid` varchar(36) NULL;
--> statement-breakpoint
CREATE INDEX `rental_reminder_textline_idx`
  ON `rental_reminder_deliveries` (`providerId`, `textlineDepartmentUuid`);

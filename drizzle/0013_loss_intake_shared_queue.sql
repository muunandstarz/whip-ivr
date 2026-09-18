ALTER TABLE `loss_intake_claims`
  ADD COLUMN `reported_vin_last_six` VARCHAR(16) NULL,
  ADD COLUMN `vin_correction_evidence` TEXT NULL,
  ADD COLUMN `member_phone` VARCHAR(64) NULL,
  ADD COLUMN `preferred_language` VARCHAR(128) NULL,
  ADD COLUMN `intake_claimed_by_handler_id` INT NULL,
  ADD COLUMN `intake_claimed_by_name` VARCHAR(128) NULL,
  ADD COLUMN `intake_claimed_at` TIMESTAMP NULL;

CREATE INDEX `loss_intake_claims_shared_queue_idx`
  ON `loss_intake_claims` (`is_duplicate`, `channelName`, `intake_claimed_by_handler_id`, `postedAt`);

CREATE TABLE `loss_intake_daily_metrics` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `date_key` VARCHAR(16) NOT NULL,
  `handler_id` INT NOT NULL,
  `handler_name` VARCHAR(128) NOT NULL,
  `items_claimed` INT NOT NULL DEFAULT 0,
  `first_contacts` INT NOT NULL DEFAULT 0,
  `statements_obtained` INT NOT NULL DEFAULT 0,
  `templates_posted` INT NOT NULL DEFAULT 0,
  `open_at_close` INT NOT NULL DEFAULT 0,
  `median_business_minutes` FLOAT NULL,
  `snapshot_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `loss_intake_daily_metrics_handler_date_unique` (`date_key`, `handler_id`)
);

ALTER TABLE `loss_intake_settings`
  ADD COLUMN `intake_slack_destination_channel_id` VARCHAR(32) NULL,
  ADD COLUMN `intake_slack_publishing_enabled` BOOLEAN NOT NULL DEFAULT FALSE;

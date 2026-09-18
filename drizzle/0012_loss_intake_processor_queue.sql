ALTER TABLE `loss_intake_claims`
  ADD COLUMN `processor_status` ENUM('not_started', 'filing', 'filed', 'not_a_claim') NOT NULL DEFAULT 'not_started',
  ADD COLUMN `processor_claim_number` VARCHAR(128) NULL,
  ADD COLUMN `processor_taken_by_handler_id` INT NULL,
  ADD COLUMN `processor_taken_by_name` VARCHAR(128) NULL,
  ADD COLUMN `processor_taken_at` TIMESTAMP NULL,
  ADD COLUMN `processor_not_a_claim_reason` VARCHAR(500) NULL,
  ADD COLUMN `processor_status_updated_at` TIMESTAMP NULL,
  ADD COLUMN `processor_status_updated_by` VARCHAR(255) NULL,
  ADD COLUMN `processor_filed_visible_until` TIMESTAMP NULL,
  ADD COLUMN `inspection_scheduled_at` TIMESTAMP NULL,
  ADD COLUMN `inspection_schedule_source` VARCHAR(32) NULL;

CREATE INDEX `loss_intake_claims_processor_queue_idx`
  ON `loss_intake_claims` (`processor_status`, `vinLastSix`, `postedAt`);

CREATE TABLE `loss_intake_processor_vin_exclusions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `vin_last_six` VARCHAR(16) NOT NULL,
  `reason` VARCHAR(500) NOT NULL,
  `marked_by_handler_id` INT NULL,
  `marked_by_name` VARCHAR(128) NOT NULL,
  `marked_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `loss_intake_processor_vin_exclusions_vin_last_six_unique` (`vin_last_six`)
);

ALTER TABLE `loss_intake_settings`
  ADD COLUMN `processors_digest_date_key` VARCHAR(16) NULL;

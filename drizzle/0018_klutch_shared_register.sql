-- Shared Klutch register extensions for the supplied policy-document workflow.
-- Additive/backward-compatible: existing policy records retain their stored JSON terms.

INSERT INTO `klutch_number_sequences` (`sequence_key`, `last_issued`)
VALUES ('policy', 100099)
ON DUPLICATE KEY UPDATE `last_issued` = GREATEST(`last_issued`, 100099);

ALTER TABLE `klutch_policies`
  ADD COLUMN `member_name` VARCHAR(255) NOT NULL DEFAULT '' AFTER `lease_id`,
  ADD COLUMN `member_number` VARCHAR(128) NOT NULL DEFAULT '' AFTER `member_name`,
  ADD COLUMN `vin_normalized` VARCHAR(40) NOT NULL DEFAULT '' AFTER `member_number`,
  ADD COLUMN `vehicle` VARCHAR(255) NOT NULL DEFAULT '' AFTER `vin_normalized`,
  ADD COLUMN `previous_policy_id` INT NULL AFTER `vehicle`,
  ADD COLUMN `new_lease_confirmed` TINYINT(1) NOT NULL DEFAULT 0 AFTER `previous_policy_id`,
  ADD KEY `klutch_policies_vin_status_idx` (`vin_normalized`, `status`),
  ADD KEY `klutch_policies_member_lookup_idx` (`member_name`, `member_number`);

CREATE TABLE `klutch_vin_register` (
  `vin_normalized` VARCHAR(40) NOT NULL,
  `latest_policy_id` INT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`vin_normalized`)
);

ALTER TABLE `klutch_policy_terms`
  ADD COLUMN `revision_number` INT NOT NULL DEFAULT 1 AFTER `term_number`,
  ADD COLUMN `term_months` INT NOT NULL DEFAULT 12 AFTER `revision_number`,
  ADD COLUMN `transaction_type` VARCHAR(16) NOT NULL DEFAULT 'new' AFTER `term_months`,
  DROP INDEX `klutch_policy_terms_policy_term_uniq`,
  ADD UNIQUE KEY `klutch_policy_terms_policy_term_revision_uniq` (`policy_id`, `term_number`, `revision_number`);

ALTER TABLE `klutch_claims`
  DROP INDEX `klutch_claims_claim_sequence_unique`,
  MODIFY COLUMN `claim_sequence` INT NULL;

ALTER TABLE `klutch_policy_events`
  MODIFY COLUMN `event_type` ENUM('issued','renewed','corrected','terms_amended','cancelled','claim_mapped','document_created') NOT NULL;

ALTER TABLE `klutch_policy_documents`
  ADD COLUMN `term_id` INT NULL AFTER `claim_id`,
  ADD COLUMN `policy_transaction_type` VARCHAR(16) NOT NULL DEFAULT 'new' AFTER `delivery_status`,
  ADD COLUMN `policy_number` VARCHAR(24) NOT NULL DEFAULT '' AFTER `policy_transaction_type`,
  ADD COLUMN `klutch_claim_number` VARCHAR(24) NULL AFTER `policy_number`,
  ADD COLUMN `member_name` VARCHAR(255) NOT NULL DEFAULT '' AFTER `klutch_claim_number`,
  ADD COLUMN `handler_title` VARCHAR(255) NOT NULL DEFAULT '' AFTER `member_name`,
  ADD KEY `klutch_policy_documents_number_created_idx` (`policy_number`, `created_at`),
  ADD KEY `klutch_policy_documents_transaction_created_idx` (`policy_transaction_type`, `created_at`);

ALTER TABLE `klutch_endorsement_approvals`
  ADD COLUMN `manager_name` VARCHAR(255) NOT NULL DEFAULT '' AFTER `carrier_request_evidence`,
  ADD COLUMN `approval_confirmed` TINYINT(1) NOT NULL DEFAULT 0 AFTER `manager_name`;

CREATE TABLE `klutch_policy_drafts` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `handler_name` VARCHAR(255) NOT NULL DEFAULT '',
  `handler_title` VARCHAR(255) NOT NULL DEFAULT '',
  `draft` JSON NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `klutch_policy_drafts_user_unique` (`user_id`)
);

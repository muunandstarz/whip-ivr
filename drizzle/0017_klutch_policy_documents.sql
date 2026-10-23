-- Durable Klutch policy issuance, claim mapping, and created-not-sent document audit.
-- Additive only: no existing document-generator, COI, declaration, or claim data is changed.

CREATE TABLE `klutch_number_sequences` (
  `sequence_key` VARCHAR(32) NOT NULL,
  `last_issued` INT NOT NULL DEFAULT 0,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`sequence_key`)
);

INSERT INTO `klutch_number_sequences` (`sequence_key`, `last_issued`)
VALUES ('policy', 0), ('claim', 0);

CREATE TABLE `klutch_policies` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `policy_number` VARCHAR(24) NOT NULL,
  `policy_sequence` INT NOT NULL,
  `issue_request_key` VARCHAR(96) NOT NULL,
  `lease_id` VARCHAR(128) NOT NULL,
  `state` VARCHAR(2) NOT NULL,
  `effective_on` DATE NOT NULL,
  `expires_on` DATE NOT NULL,
  `status` ENUM('active','cancelled','expired') NOT NULL DEFAULT 'active',
  `cancelled_on` DATE NULL,
  `cancellation_reason` TEXT NULL,
  `terms` JSON NOT NULL,
  `created_by_user_id` INT NOT NULL,
  `created_by_name` VARCHAR(255) NOT NULL,
  `updated_by_user_id` INT NOT NULL,
  `updated_by_name` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `klutch_policies_policy_number_unique` (`policy_number`),
  UNIQUE KEY `klutch_policies_policy_sequence_unique` (`policy_sequence`),
  UNIQUE KEY `klutch_policies_issue_request_key_unique` (`issue_request_key`),
  KEY `klutch_policies_lease_status_idx` (`lease_id`, `status`),
  KEY `klutch_policies_state_dates_idx` (`state`, `effective_on`, `expires_on`)
);

CREATE TABLE `klutch_policy_terms` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `policy_id` INT NOT NULL,
  `term_number` INT NOT NULL,
  `effective_on` DATE NOT NULL,
  `expires_on` DATE NOT NULL,
  `terms` JSON NOT NULL,
  `created_by_user_id` INT NOT NULL,
  `created_by_name` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `klutch_policy_terms_policy_term_uniq` (`policy_id`, `term_number`)
);

CREATE TABLE `klutch_claims` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `policy_id` INT NOT NULL,
  `klutch_claim_number` VARCHAR(24) NOT NULL,
  `claim_sequence` INT NOT NULL,
  `snapsheet_claim_number` VARCHAR(128) NOT NULL,
  `created_by_user_id` INT NOT NULL,
  `created_by_name` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `klutch_claims_klutch_claim_number_unique` (`klutch_claim_number`),
  UNIQUE KEY `klutch_claims_claim_sequence_unique` (`claim_sequence`),
  UNIQUE KEY `klutch_claims_snapsheet_claim_number_unique` (`snapsheet_claim_number`),
  KEY `klutch_claims_policy_idx` (`policy_id`)
);

CREATE TABLE `klutch_policy_events` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `policy_id` INT NOT NULL,
  `event_type` ENUM('issued','renewed','terms_amended','cancelled','claim_mapped','document_created') NOT NULL,
  `actor_user_id` INT NOT NULL,
  `actor_name` VARCHAR(255) NOT NULL,
  `metadata` JSON NULL,
  `occurred_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `klutch_policy_events_policy_idx` (`policy_id`, `occurred_at`)
);

CREATE TABLE `klutch_policy_documents` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `policy_id` INT NOT NULL,
  `claim_id` INT NULL,
  `document_type` ENUM('declarations','tnc_denial','carrier_position','cancellation_notice','endorsement') NOT NULL,
  `document_version` VARCHAR(48) NOT NULL,
  `delivery_status` ENUM('CREATED_NOT_SENT') NOT NULL DEFAULT 'CREATED_NOT_SENT',
  `input_snapshot` JSON NOT NULL,
  `created_by_user_id` INT NOT NULL,
  `created_by_name` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `klutch_policy_documents_policy_type_idx` (`policy_id`, `document_type`, `created_at`),
  KEY `klutch_policy_documents_claim_type_idx` (`claim_id`, `document_type`, `created_at`)
);

CREATE TABLE `klutch_endorsement_approvals` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `policy_id` INT NOT NULL,
  `claim_id` INT NULL,
  `carrier_request_evidence` TEXT NOT NULL,
  `approved_by_user_id` INT NOT NULL,
  `approved_by_name` VARCHAR(255) NOT NULL,
  `approved_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `klutch_endorsement_approvals_policy_idx` (`policy_id`, `approved_at`)
);

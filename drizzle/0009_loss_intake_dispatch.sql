-- Migration: 0009_loss_intake_dispatch
-- Adds the explicit operational fields used by the Loss Intake Dispatch board.

ALTER TABLE `loss_intake_claims`
  ADD COLUMN `source_kind` enum('structured','unstructured') NOT NULL DEFAULT 'structured',
  ADD COLUMN `on_site_flag` tinyint(1) NOT NULL DEFAULT 0,
  ADD COLUMN `on_site_detected_at` timestamp NULL,
  ADD COLUMN `on_site_reason` text,
  ADD COLUMN `first_response_business_minutes` float,
  ADD COLUMN `template_business_minutes` float,
  ADD COLUMN `sla_target_business_minutes` int,
  ADD COLUMN `claim_id` varchar(128),
  ADD COLUMN `filing_state` enum('filed','unfiled','pending_statement','unverified') NOT NULL DEFAULT 'unverified',
  ADD COLUMN `filing_evidence` text,
  ADD COLUMN `duplicate_group_key` varchar(255),
  ADD COLUMN `data_warnings` text;

CREATE TABLE `loss_intake_source_links` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` int NOT NULL,
  `slack_key` varchar(128) NOT NULL,
  `channel_id` varchar(32) NOT NULL,
  `channel_name` varchar(128) NOT NULL,
  `slack_permalink` text,
  `posted_at` timestamp NOT NULL,
  `source_role` enum('primary','duplicate') NOT NULL DEFAULT 'primary',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `loss_intake_source_links_slack_key_unique` (`slack_key`)
);

ALTER TABLE `loss_intake_settings`
  ADD COLUMN `escalations_channel_id` varchar(32) NOT NULL DEFAULT 'C03LK1Z8XFG',
  ADD COLUMN `claims_processing_channel_id` varchar(32) NOT NULL DEFAULT 'C08UF1Z61QE',
  ADD COLUMN `claims_processors_channel_id` varchar(32) NOT NULL DEFAULT 'C0C1F9BRM6Y',
  ADD COLUMN `claims_intake_reps_channel_id` varchar(32) NOT NULL DEFAULT 'C0C1DHLHKND',
  ADD COLUMN `dispatch_schedule_task_uid` varchar(65),
  ADD COLUMN `processors_digest_message_ts` varchar(32),
  ADD COLUMN `intake_digest_message_ts` varchar(32),
  ADD COLUMN `intake_digest_date_key` varchar(16);

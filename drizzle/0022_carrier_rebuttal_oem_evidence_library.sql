-- Carrier Rebuttal OEM evidence library: metadata and outbound links only.
-- This migration intentionally contains no PDF/document bytes, extracted manual text,
-- screenshots, source excerpts, storage keys, or case-upload persistence.
CREATE TABLE IF NOT EXISTS `oem_procedure_sources` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `source_key` VARCHAR(160) NOT NULL,
  `manufacturer` VARCHAR(96) NOT NULL,
  `make` VARCHAR(96) NOT NULL,
  `model_key` VARCHAR(96) NULL,
  `model_label` VARCHAR(160) NOT NULL,
  `model_year_start` INT NULL,
  `model_year_end` INT NULL,
  `source_kind` ENUM('official_collision_procedure','owner_manual_reference','pending') NOT NULL,
  `title` VARCHAR(512) NOT NULL,
  `publisher` VARCHAR(256) NOT NULL,
  `source_url` TEXT NULL,
  `revision_display` VARCHAR(512) NOT NULL,
  `accessed_on` VARCHAR(32) NOT NULL,
  `topic` VARCHAR(256) NOT NULL,
  `relevance_note` TEXT NOT NULL,
  `status` ENUM('active','reference_only','pending','retired') NOT NULL DEFAULT 'active',
  `export_allowed` BOOLEAN NOT NULL DEFAULT FALSE,
  `terms_url` TEXT NULL,
  `terms_note` TEXT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT (now()),
  `updated_at` TIMESTAMP NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `oem_procedure_sources_source_key_unique` (`source_key`),
  INDEX `oem_procedure_sources_vehicle_idx` (`make`, `model_key`, `model_year_start`, `model_year_end`),
  INDEX `oem_procedure_sources_status_idx` (`status`, `source_kind`)
);

-- Every record below is a citation/link record. No Tesla content is copied here.
INSERT IGNORE INTO `oem_procedure_sources`
  (`source_key`,`manufacturer`,`make`,`model_key`,`model_label`,`model_year_start`,`model_year_end`,`source_kind`,`title`,`publisher`,`source_url`,`revision_display`,`accessed_on`,`topic`,`relevance_note`,`status`,`export_allowed`,`terms_url`,`terms_note`)
VALUES
  ('tesla-m3-2017-2023-collision-index','Tesla','Tesla','model_3','Model 3',2017,2023,'official_collision_procedure','2017–2023 Model 3 Collision Repair Procedures','Tesla Service','https://service.tesla.com/docs/BodyRepair/Body_Repair_Procedures/Model_3/HTML/en-us/index.html','Tesla Service page © 2026; live source verified 2026-10-30','2026-10-30','Collision repair procedure family index','Use only after the handler confirms the vehicle year/model family and identifies a case-specific marked procedure exhibit. The index itself does not establish a repair operation.','active',TRUE,'https://www.tesla.com/legal','Link-out metadata only. Do not bulk-download, mirror, cache, screenshot, or reproduce Tesla source content. A handler must verify the live source and identify a case-specific marked exhibit before relying on it.'),
  ('tesla-m3-2024-plus-collision-index','Tesla','Tesla','model_3','Model 3',2024,NULL,'official_collision_procedure','2024+ Model 3 Collision Repair Procedures','Tesla Service','https://service.tesla.com/docs/BodyRepair/Body_Repair_Procedures/Model_3_2024/HTML/en-us/index.html','Tesla Service page © 2026; live source verified 2026-10-30','2026-10-30','Collision repair procedure family index','Use only after the handler confirms the vehicle year/model family and identifies a case-specific marked procedure exhibit. The index itself does not establish a repair operation.','active',TRUE,'https://www.tesla.com/legal','Link-out metadata only. Do not bulk-download, mirror, cache, screenshot, or reproduce Tesla source content. A handler must verify the live source and identify a case-specific marked exhibit before relying on it.'),
  ('tesla-my-2020-2024-collision-index','Tesla','Tesla','model_y','Model Y',2020,2024,'official_collision_procedure','2020–2024 Model Y Collision Repair Procedures','Tesla Service','https://service.tesla.com/docs/BodyRepair/Body_Repair_Procedures/Model_Y/HTML/en-us/index.html','Tesla Service page © 2026; live source verified 2026-10-30','2026-10-30','Collision repair procedure family index','Use only after the handler confirms the vehicle year/model family and identifies a case-specific marked procedure exhibit. The index itself does not establish a repair operation.','active',TRUE,'https://www.tesla.com/legal','Link-out metadata only. Do not bulk-download, mirror, cache, screenshot, or reproduce Tesla source content. A handler must verify the live source and identify a case-specific marked exhibit before relying on it.'),
  ('tesla-my-2025-plus-collision-index','Tesla','Tesla','model_y','Model Y',2025,NULL,'official_collision_procedure','2025+ Model Y Collision Repair Procedures','Tesla Service','https://service.tesla.com/docs/BodyRepair/Body_Repair_Procedures/Model_Y_2025/en-us/index.html','Tesla Service page © 2026; live source verified 2026-10-30','2026-10-30','Collision repair procedure family index','Use only after the handler confirms the vehicle year/model family and identifies a case-specific marked procedure exhibit. The index itself does not establish a repair operation.','active',TRUE,'https://www.tesla.com/legal','Link-out metadata only. Do not bulk-download, mirror, cache, screenshot, or reproduce Tesla source content. A handler must verify the live source and identify a case-specific marked exhibit before relying on it.'),
  ('tesla-m3-2017-2023-owner-reference','Tesla','Tesla','model_3','Model 3',2017,2023,'owner_manual_reference','2017–2023 Model 3 Owner Manual — user-provided reference, not retained','Tesla / user-provided copy',NULL,'North America; software 2026.38.3; supplied 2026-10-30','2026-10-30','Owner-facing operational and safety context','Reference-only. This owner manual is not retained, exported, quoted, or used to state collision repair methodology. Use the live collision-procedure family plus marked case evidence for any repair-operation support.','reference_only',FALSE,'https://www.tesla.com/legal','User-provided owner-manual PDFs are not copied into this application, database, project, storage, or exports.'),
  ('tesla-m3-2024-plus-owner-reference','Tesla','Tesla','model_3','Model 3',2024,NULL,'owner_manual_reference','2024+ Model 3 Owner Manual — user-provided reference, not retained','Tesla / user-provided copy',NULL,'North America; software 2026.38.3; supplied 2026-10-30','2026-10-30','Owner-facing operational and safety context','Reference-only. This owner manual is not retained, exported, quoted, or used to state collision repair methodology. Use the live collision-procedure family plus marked case evidence for any repair-operation support.','reference_only',FALSE,'https://www.tesla.com/legal','User-provided owner-manual PDFs are not copied into this application, database, project, storage, or exports.'),
  ('tesla-my-2020-2024-owner-reference','Tesla','Tesla','model_y','Model Y',2020,2024,'owner_manual_reference','2020–2024 Model Y Owner Manual — user-provided reference, not retained','Tesla / user-provided copy',NULL,'North America; software 2026.38.3; supplied 2026-10-30','2026-10-30','Owner-facing operational and safety context','Reference-only. This owner manual is not retained, exported, quoted, or used to state collision repair methodology. Use the live collision-procedure family plus marked case evidence for any repair-operation support.','reference_only',FALSE,'https://www.tesla.com/legal','User-provided owner-manual PDFs are not copied into this application, database, project, storage, or exports.'),
  ('tesla-my-2025-plus-owner-reference','Tesla','Tesla','model_y','Model Y',2025,NULL,'owner_manual_reference','2025+ Model Y Owner Manual — user-provided reference, not retained','Tesla / user-provided copy',NULL,'North America; software 2026.38.3; supplied 2026-10-30','2026-10-30','Owner-facing operational and safety context','Reference-only. This owner manual is not retained, exported, quoted, or used to state collision repair methodology. Use the live collision-procedure family plus marked case evidence for any repair-operation support.','reference_only',FALSE,'https://www.tesla.com/legal','User-provided owner-manual PDFs are not copied into this application, database, project, storage, or exports.');

CREATE TABLE IF NOT EXISTS `carrier_rebuttal_ai_reviews` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `claim_number` VARCHAR(96) NOT NULL,
  `vehicle_year` INT NOT NULL,
  `vehicle_make` VARCHAR(96) NOT NULL,
  `vehicle_model` VARCHAR(128) NOT NULL,
  `vin` VARCHAR(40) NULL,
  `selected_source_keys` JSON NOT NULL,
  `input_fingerprint` VARCHAR(96) NOT NULL,
  `model_id` VARCHAR(96) NOT NULL,
  `status` ENUM('claude_completed','claude_unavailable','claude_malformed','manual_review_required') NOT NULL,
  `review_output` JSON NOT NULL,
  `created_by_user_id` INT NOT NULL,
  `created_by_name` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  INDEX `carrier_rebuttal_ai_reviews_claim_created_idx` (`claim_number`, `created_at`),
  INDEX `carrier_rebuttal_ai_reviews_created_idx` (`created_at`)
);

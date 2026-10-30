-- Carrier Rebuttal claim-source audit linkage.
-- Stores opaque originating claim-record IDs only; it never stores a source body,
-- attachment bytes, original URL, filename, screenshot, or object-storage key.
ALTER TABLE `carrier_rebuttal_ai_reviews`
  ADD COLUMN `selected_claim_source_ids` JSON NULL AFTER `selected_source_keys`;

UPDATE `carrier_rebuttal_ai_reviews`
  SET `selected_claim_source_ids` = JSON_ARRAY()
  WHERE `selected_claim_source_ids` IS NULL;

ALTER TABLE `carrier_rebuttal_ai_reviews`
  MODIFY COLUMN `selected_claim_source_ids` JSON NOT NULL;

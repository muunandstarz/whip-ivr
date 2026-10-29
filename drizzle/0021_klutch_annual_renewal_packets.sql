-- Preserve the original annual issuance plan for idempotent automatic-renewal packets.
-- Existing policies remain valid with one original term and no reference date.
ALTER TABLE `klutch_policies`
  ADD COLUMN `initial_issue_fingerprint` VARCHAR(64) NOT NULL DEFAULT '' AFTER `issue_request_key`;

ALTER TABLE `klutch_policies`
  ADD COLUMN `initial_issue_reference_on` DATE NULL AFTER `expires_on`;

ALTER TABLE `klutch_policies`
  ADD COLUMN `initial_issue_term_count` INT NOT NULL DEFAULT 1 AFTER `initial_issue_reference_on`;

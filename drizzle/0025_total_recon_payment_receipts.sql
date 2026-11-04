-- Additive issued-receipt metadata only; PDFs and templates are not stored here.
-- Drizzle generation declined due to unrelated historical call_history rename.
CREATE TABLE IF NOT EXISTS `total_recon_payment_receipts` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `request_key` varchar(36) NOT NULL,
  `claim_number` varchar(96) NOT NULL,
  `input_snapshot` json NOT NULL,
  `input_hash` varchar(64) NOT NULL,
  `created_by_user_id` int NOT NULL,
  `created_by_name` varchar(255),
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `total_recon_payment_receipts_request_key_unique` (`request_key`),
  INDEX `total_recon_receipts_claim_created_idx` (`claim_number`, `created_at`)
);

-- Migration: 0010_loss_intake_dispatch_message_signatures
-- Persists the last published content signature for idempotent Dispatch worklist publishing.

ALTER TABLE `loss_intake_settings`
  ADD COLUMN `processors_digest_signature` varchar(64),
  ADD COLUMN `intake_digest_signature` varchar(64);

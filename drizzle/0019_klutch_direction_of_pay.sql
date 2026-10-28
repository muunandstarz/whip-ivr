-- Add the MetroCars Direction of Pay form to the durable Klutch document audit.
-- Existing document records and delivery states are preserved unchanged.
ALTER TABLE `klutch_policy_documents`
  MODIFY COLUMN `document_type` ENUM('declarations','tnc_denial','carrier_position','cancellation_notice','endorsement','direction_of_pay') NOT NULL;

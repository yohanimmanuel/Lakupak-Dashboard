-- Order and payment states belong only to the authoritative Order table.
-- BuyerRecord continues to store product metadata, spend and outstanding balances.
ALTER TABLE "BuyerRecord"
  DROP COLUMN IF EXISTS "orderStatus",
  DROP COLUMN IF EXISTS "paymentStatus";

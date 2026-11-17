-- Persist editable order/payment states for manually maintained Buyer order rows.
-- Live marketplace/manual Order records continue to be authoritative in the Order table.
ALTER TABLE "BuyerRecord"
  ADD COLUMN IF NOT EXISTS "orderStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "paymentStatus" TEXT;

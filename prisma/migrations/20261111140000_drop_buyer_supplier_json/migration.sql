-- Drop legacy JSON blob columns; data already lives in BuyerRecord / SupplyRecord.
ALTER TABLE "Buyer" DROP COLUMN IF EXISTS "orderDetails";
ALTER TABLE "Supplier" DROP COLUMN IF EXISTS "supplies";
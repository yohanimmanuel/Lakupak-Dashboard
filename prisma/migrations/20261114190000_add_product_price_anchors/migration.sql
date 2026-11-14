ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sellingPriceUnit" TEXT NOT NULL DEFAULT 'Pieces';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "purchasePriceUnit" TEXT NOT NULL DEFAULT 'Pieces';

-- Canonical per-Piece prices can be fractional when an anchor package contains
-- a non-divisible number of pieces (for example, Rp 10,000 / 120 pieces).
-- Preserve those equivalents rather than rounding away value during per-Piece price storage.
ALTER TABLE "VariantOption"
  ALTER COLUMN "purchasePrice" TYPE DECIMAL(18, 6) USING "purchasePrice"::DECIMAL(18, 6),
  ALTER COLUMN "sellingPrice" TYPE DECIMAL(18, 6) USING "sellingPrice"::DECIMAL(18, 6);

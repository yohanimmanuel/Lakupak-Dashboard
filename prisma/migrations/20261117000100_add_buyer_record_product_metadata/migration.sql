-- Preserve catalog/variant selections for manually maintained buyer order rows.
-- Existing marketplace-synced BuyerRecord rows remain valid with NULL metadata.
ALTER TABLE "BuyerRecord"
  ADD COLUMN IF NOT EXISTS "productId" TEXT,
  ADD COLUMN IF NOT EXISTS "variantOptionId" INTEGER,
  ADD COLUMN IF NOT EXISTS "variantName" TEXT,
  ADD COLUMN IF NOT EXISTS "stockType" TEXT,
  ADD COLUMN IF NOT EXISTS "piecesPerPackage" INTEGER;

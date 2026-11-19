-- Preserve the exact VariantOption stock target for each applied supplier receipt.
-- There is deliberately no FK: the catalog option may be deleted later.
ALTER TABLE "SupplyRecord"
ADD COLUMN "stockAppliedVariantOptionId" INTEGER;

-- Existing rows used the live FK for stock updates. Preserve that ID, falling back
-- to the historical snapshot for rows whose live FK was already set to NULL.
UPDATE "SupplyRecord"
SET "stockAppliedVariantOptionId" = COALESCE("variantOptionId", "historicalVariantOptionId")
WHERE "stockApplied" = TRUE
  AND "stockAppliedVariantOptionId" IS NULL;

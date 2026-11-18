-- Backfill receipts created before stockApplied was reliably persisted.
-- In the legacy supplier flow, updateCurrentStock=true meant the receipt quantity
-- had already been applied to VariantOption stock; stockApplied was added later
-- and older rows inherited its FALSE database default.
-- Mark these existing checked receipts as applied so they are not counted twice
-- against AUTO product-stock snapshots and can be reversed when the user unchecks.
UPDATE "SupplyRecord"
SET "stockApplied" = TRUE
WHERE "updateCurrentStock" = TRUE
  AND "stockApplied" = FALSE;

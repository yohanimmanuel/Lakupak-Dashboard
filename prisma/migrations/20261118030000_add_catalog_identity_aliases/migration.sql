-- Catalog identity migration. All original client/supplier values remain in snapshot columns.
-- Only deterministic, unique matches are linked automatically; ambiguous rows remain NULL for review.

ALTER TABLE "BuyerRecord" ADD COLUMN IF NOT EXISTS "skuSnapshot" TEXT;
ALTER TABLE "SupplyRecord" ADD COLUMN IF NOT EXISTS "variantOptionId" INTEGER;

CREATE TABLE IF NOT EXISTS "CatalogIdentityAlias" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "aliasType" TEXT NOT NULL,
  "aliasValue" TEXT NOT NULL,
  "normalizedValue" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'legacy',
  "externalSystem" TEXT,
  "legacyProductId" TEXT,
  "legacyVariantOptionId" INTEGER,
  "legacyProductName" TEXT,
  "legacyVariantName" TEXT,
  "legacySku" TEXT,
  "canonicalProductId" TEXT,
  "canonicalVariantOptionId" INTEGER,
  "verified" BOOLEAN NOT NULL DEFAULT FALSE,
  "metadata" JSONB,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CatalogIdentityAlias_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CatalogIdentityAlias_product_fkey"
    FOREIGN KEY ("canonicalProductId") REFERENCES "Product"("productId") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CatalogIdentityAlias_variant_fkey"
    FOREIGN KEY ("canonicalVariantOptionId") REFERENCES "VariantOption"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Link Buyer records by exact product ID + variant label. The historical text remains unchanged.
UPDATE "BuyerRecord" br
SET "variantOptionId" = matched."variantOptionId"
FROM (
  SELECT br2."id" AS "buyerRecordId", MIN(vo."id") AS "variantOptionId"
  FROM "BuyerRecord" br2
  JOIN "Buyer" b ON b."id" = br2."buyerRefId"
  JOIN "Product" p ON p."productId" = br2."productId" AND p."userId" = b."userId"
  JOIN "VariantOption" vo ON vo."productId" = p."id"
    AND LOWER(TRIM(vo."variantName")) = LOWER(TRIM(br2."variantName"))
  WHERE br2."variantOptionId" IS NULL
  GROUP BY br2."id"
  HAVING COUNT(DISTINCT vo."id") = 1
) matched
WHERE br."id" = matched."buyerRecordId";

-- Snapshot the current variant SKU only where a BuyerRecord did not retain one.
UPDATE "BuyerRecord" br
SET "skuSnapshot" = vo."sku"
FROM "VariantOption" vo
WHERE br."variantOptionId" = vo."id"
  AND br."skuSnapshot" IS NULL;

-- Link Supplier records first by exact current Product ID + variant name.
UPDATE "SupplyRecord" sr
SET "variantOptionId" = matched."variantOptionId"
FROM (
  SELECT sr2."id" AS "supplyRecordId", MIN(vo."id") AS "variantOptionId"
  FROM "SupplyRecord" sr2
  JOIN "Supplier" s ON s."id" = sr2."supplierRefId"
  JOIN "Product" p ON p."productId" = sr2."productId" AND p."userId" = s."userId"
  JOIN "VariantOption" vo ON vo."productId" = p."id"
    AND LOWER(TRIM(vo."variantName")) = LOWER(TRIM(sr2."variantName"))
  WHERE sr2."variantOptionId" IS NULL
  GROUP BY sr2."id"
  HAVING COUNT(DISTINCT vo."id") = 1
) matched
WHERE sr."id" = matched."supplyRecordId";

-- Fallback only when the SKU identifies exactly one active variant for this distributor.
UPDATE "SupplyRecord" sr
SET "variantOptionId" = matched."variantOptionId",
    "productId" = matched."productId"
FROM (
  SELECT sr2."id" AS "supplyRecordId",
         MIN(vo."id") AS "variantOptionId",
         MIN(p."productId") AS "productId"
  FROM "SupplyRecord" sr2
  JOIN "Supplier" s ON s."id" = sr2."supplierRefId"
  JOIN "Product" p ON p."userId" = s."userId"
  JOIN "VariantOption" vo ON vo."productId" = p."id"
    AND LOWER(TRIM(vo."sku")) = LOWER(TRIM(sr2."sku"))
    AND vo."isActive" = TRUE
  WHERE sr2."variantOptionId" IS NULL
    AND NULLIF(TRIM(sr2."sku"), '') IS NOT NULL
  GROUP BY sr2."id"
  HAVING COUNT(DISTINCT vo."id") = 1
) matched
WHERE sr."id" = matched."supplyRecordId";

-- Preserve old buyer identifiers as aliases. Only rows with a canonical relation are verified.
INSERT INTO "CatalogIdentityAlias"
  ("userId", "aliasType", "aliasValue", "normalizedValue", "source",
   "legacyProductId", "legacyProductName", "legacyVariantName", "legacySku",
   "canonicalProductId", "canonicalVariantOptionId", "verified")
SELECT DISTINCT
  b."userId", 'legacy_variant',
  CONCAT(COALESCE(br."productId", ''), '|', COALESCE(br."product", ''), '|', COALESCE(br."variantName", ''), '|', COALESCE(br."skuSnapshot", '')),
  LOWER(TRIM(CONCAT(COALESCE(br."productId", ''), '|', COALESCE(br."product", ''), '|', COALESCE(br."variantName", ''), '|', COALESCE(br."skuSnapshot", '')))),
  'buyer_record', br."productId", br."product", br."variantName", br."skuSnapshot",
  p."productId", br."variantOptionId", br."variantOptionId" IS NOT NULL
FROM "BuyerRecord" br
JOIN "Buyer" b ON b."id" = br."buyerRefId"
LEFT JOIN "VariantOption" vo ON vo."id" = br."variantOptionId"
LEFT JOIN "Product" p ON p."id" = vo."productId"
WHERE b."userId" IS NOT NULL
  AND (NULLIF(TRIM(br."product"), '') IS NOT NULL OR NULLIF(TRIM(br."skuSnapshot"), '') IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM "CatalogIdentityAlias" a
    WHERE a."userId" = b."userId" AND a."aliasType" = 'legacy_variant'
      AND a."normalizedValue" = LOWER(TRIM(CONCAT(COALESCE(br."productId", ''), '|', COALESCE(br."product", ''), '|', COALESCE(br."variantName", ''), '|', COALESCE(br."skuSnapshot", ''))))
  );

-- Preserve supplier history identifiers; no quantity, purchase value, date, or ID is discarded.
INSERT INTO "CatalogIdentityAlias"
  ("userId", "aliasType", "aliasValue", "normalizedValue", "source",
   "legacyProductId", "legacyProductName", "legacyVariantName", "legacySku",
   "canonicalProductId", "canonicalVariantOptionId", "verified")
SELECT DISTINCT
  s."userId", 'legacy_variant',
  CONCAT(COALESCE(sr."productId", ''), '|', COALESCE(sr."product", ''), '|', COALESCE(sr."variantName", ''), '|', COALESCE(sr."sku", '')),
  LOWER(TRIM(CONCAT(COALESCE(sr."productId", ''), '|', COALESCE(sr."product", ''), '|', COALESCE(sr."variantName", ''), '|', COALESCE(sr."sku", '')))),
  'supplier_record', sr."productId", sr."product", sr."variantName", sr."sku",
  p."productId", sr."variantOptionId", sr."variantOptionId" IS NOT NULL
FROM "SupplyRecord" sr
JOIN "Supplier" s ON s."id" = sr."supplierRefId"
LEFT JOIN "VariantOption" vo ON vo."id" = sr."variantOptionId"
LEFT JOIN "Product" p ON p."id" = vo."productId"
WHERE s."userId" IS NOT NULL
  AND (NULLIF(TRIM(sr."product"), '') IS NOT NULL OR NULLIF(TRIM(sr."sku"), '') IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM "CatalogIdentityAlias" a
    WHERE a."userId" = s."userId" AND a."aliasType" = 'legacy_variant'
      AND a."normalizedValue" = LOWER(TRIM(CONCAT(COALESCE(sr."productId", ''), '|', COALESCE(sr."product", ''), '|', COALESCE(sr."variantName", ''), '|', COALESCE(sr."sku", ''))))
  );

CREATE INDEX IF NOT EXISTS "CatalogIdentityAlias_userId_aliasType_normalizedValue_idx"
  ON "CatalogIdentityAlias"("userId", "aliasType", "normalizedValue");
CREATE INDEX IF NOT EXISTS "CatalogIdentityAlias_userId_canonicalProductId_idx"
  ON "CatalogIdentityAlias"("userId", "canonicalProductId");
CREATE INDEX IF NOT EXISTS "CatalogIdentityAlias_userId_canonicalVariantOptionId_idx"
  ON "CatalogIdentityAlias"("userId", "canonicalVariantOptionId");
CREATE INDEX IF NOT EXISTS "CatalogIdentityAlias_userId_legacyProductId_idx"
  ON "CatalogIdentityAlias"("userId", "legacyProductId");
CREATE INDEX IF NOT EXISTS "CatalogIdentityAlias_userId_legacyVariantOptionId_idx"
  ON "CatalogIdentityAlias"("userId", "legacyVariantOptionId");
CREATE INDEX IF NOT EXISTS "BuyerRecord_variantOptionId_idx" ON "BuyerRecord"("variantOptionId");
CREATE INDEX IF NOT EXISTS "SupplyRecord_variantOptionId_idx" ON "SupplyRecord"("variantOptionId");

ALTER TABLE "BuyerRecord"
  ADD CONSTRAINT "BuyerRecord_variantOptionId_fkey"
  FOREIGN KEY ("variantOptionId") REFERENCES "VariantOption"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplyRecord"
  ADD CONSTRAINT "SupplyRecord_variantOptionId_fkey"
  FOREIGN KEY ("variantOptionId") REFERENCES "VariantOption"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

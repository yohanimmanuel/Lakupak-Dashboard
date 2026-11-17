-- Product SKU is variant-specific and is now stored only on VariantOption.sku.
-- Preserve every legacy Product.sku before removing the redundant column.
-- If a product has no VariantOption yet, create a minimal Default variant so
-- its existing SKU remains attached to the product's primary variant.
INSERT INTO "VariantOption" (
  "productId",
  "variantName",
  "attributes",
  "sku",
  "purchasePrice",
  "sellingPrice",
  "stockQuantity",
  "lowStockThreshold",
  "stockStatus",
  "isDefault",
  "isActive",
  "createdAt",
  "updatedAt"
)
SELECT
  p."id",
  'Default',
  '{}'::jsonb,
  p."sku",
  0,
  0,
  0,
  0,
  'In Stock',
  TRUE,
  TRUE,
  NOW(),
  NOW()
FROM "Product" AS p
WHERE p."sku" IS NOT NULL
  AND BTRIM(p."sku") <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM "VariantOption" AS vo
    WHERE vo."productId" = p."id"
  );

-- Prefer the explicit default variant. If none exists, use the lowest VariantOption id.
-- Never overwrite a variant SKU that is already explicitly assigned.
WITH primary_variant AS (
  SELECT DISTINCT ON (vo."productId")
    vo."id" AS "variantOptionId",
    vo."productId"
  FROM "VariantOption" AS vo
  ORDER BY vo."productId", vo."isDefault" DESC, vo."id" ASC
)
UPDATE "VariantOption" AS vo
SET "sku" = p."sku"
FROM primary_variant AS pv
JOIN "Product" AS p ON p."id" = pv."productId"
WHERE vo."id" = pv."variantOptionId"
  AND p."sku" IS NOT NULL
  AND BTRIM(p."sku") <> ''
  AND (vo."sku" IS NULL OR BTRIM(vo."sku") = '');

ALTER TABLE "Product" DROP COLUMN "sku";

-- Order items are historical snapshots, not live catalog dependencies.
-- Backfill missing product snapshots while the current catalog row still exists.
UPDATE "OrderItem" AS oi
SET
  "productNameSnapshot" = COALESCE(NULLIF(oi."productNameSnapshot", ''), p."name"),
  "productTypeSnapshot" = COALESCE(NULLIF(oi."productTypeSnapshot", ''), p."productType"),
  "productImageSnapshot" = COALESCE(NULLIF(oi."productImageSnapshot", ''), p."images"[1])
FROM "Product" AS p
WHERE oi."productId" = p."productId"
  AND (
    oi."productNameSnapshot" IS NULL OR oi."productNameSnapshot" = '' OR
    oi."productTypeSnapshot" IS NULL OR oi."productTypeSnapshot" = '' OR
    oi."productImageSnapshot" IS NULL OR oi."productImageSnapshot" = ''
  );

-- Backfill SKU/name/attributes only when the order item still has an exact VariantOption.
-- Never infer a variant for legacy items with a missing variantOptionId.
UPDATE "OrderItem" AS oi
SET
  "productNameSnapshot" = COALESCE(NULLIF(oi."productNameSnapshot", ''), p."name"),
  "productTypeSnapshot" = COALESCE(NULLIF(oi."productTypeSnapshot", ''), p."productType"),
  "productImageSnapshot" = COALESCE(NULLIF(oi."productImageSnapshot", ''), p."images"[1]),
  "productSkuSnapshot" = COALESCE(NULLIF(oi."productSkuSnapshot", ''), vo."sku"),
  "variantNameSnapshot" = COALESCE(NULLIF(oi."variantNameSnapshot", ''), vo."variantName"),
  "variantAttributesSnapshot" = COALESCE(oi."variantAttributesSnapshot", vo."attributes")
FROM "VariantOption" AS vo
JOIN "Product" AS p ON p."id" = vo."productId"
WHERE oi."variantOptionId" = vo."id"
  AND (
    oi."productSkuSnapshot" IS NULL OR oi."productSkuSnapshot" = '' OR
    oi."variantNameSnapshot" IS NULL OR oi."variantNameSnapshot" = '' OR
    oi."variantAttributesSnapshot" IS NULL
  );

-- Make catalog references explicitly optional: deleting a product/variant clears only
-- the relation ID. Product, SKU, and variant text snapshots remain on OrderItem.
ALTER TABLE "OrderItem"
  DROP CONSTRAINT IF EXISTS "OrderItem_productId_fkey";
ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("productId")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrderItem"
  DROP CONSTRAINT IF EXISTS "OrderItem_variantId_fkey";
ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrderItem"
  DROP CONSTRAINT IF EXISTS "OrderItem_variantOptionId_fkey";
ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_variantOptionId_fkey"
  FOREIGN KEY ("variantOptionId") REFERENCES "VariantOption"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

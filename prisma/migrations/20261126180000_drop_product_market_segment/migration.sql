-- Drop unused product-level market segment (segment pricing uses variant segmentPrices + buyer business types).
ALTER TABLE "Product" DROP COLUMN IF EXISTS "marketSegment";
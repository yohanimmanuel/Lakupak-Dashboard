-- Rebuild Offer as blanket/shared promotions (no per-retailer targeting).
-- Flatten OfferDiscountType + DateRange into Offer columns; keep OfferProduct for selected_products.

-- 1) Add new columns (nullable first for backfill)
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "discountType" TEXT;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "discountValue" DECIMAL(10, 2);
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "buyQuantity" INTEGER;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "appliesTo" TEXT;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "categorySlug" TEXT;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMPTZ(3);
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "endDate" TIMESTAMPTZ(3);

-- 2) Backfill title from name
UPDATE "Offer" SET "title" = COALESCE("title", "name") WHERE "title" IS NULL;

-- 3) Backfill discount fields from highest-priority active OfferDiscountType
UPDATE "Offer" o
SET
  "discountType" = CASE
    WHEN src."discountType" = 'fixed' THEN 'fixed_amount'
    ELSE COALESCE(src."discountType", 'percentage')
  END,
  "discountValue" = COALESCE(src."discountValue", 0),
  "buyQuantity" = src."minQuantity"
FROM (
  SELECT DISTINCT ON ("offerId")
    "offerId",
    "discountType",
    "discountValue",
    "minQuantity"
  FROM "OfferDiscountType"
  ORDER BY "offerId", "isActive" DESC, "priority" DESC, "createdAt" ASC
) AS src
WHERE o."id" = src."offerId"
  AND o."discountType" IS NULL;

-- Defaults for offers that had no discount type rows
UPDATE "Offer"
SET
  "discountType" = COALESCE("discountType", 'percentage'),
  "discountValue" = COALESCE("discountValue", 0)
WHERE "discountType" IS NULL OR "discountValue" IS NULL;

-- 4) Backfill dates from first active DateRange
UPDATE "Offer" o
SET
  "startDate" = src."startDate",
  "endDate" = src."endDate"
FROM (
  SELECT DISTINCT ON ("offerId")
    "offerId",
    "startDate",
    "endDate"
  FROM "DateRange"
  WHERE "deletedAt" IS NULL
  ORDER BY "offerId", "isActive" DESC, "startDate" ASC
) AS src
WHERE o."id" = src."offerId"
  AND o."startDate" IS NULL;

-- Fallback dates if none existed
UPDATE "Offer"
SET
  "startDate" = COALESCE("startDate", "createdAt"),
  "endDate" = COALESCE("endDate", "createdAt" + INTERVAL '30 days')
WHERE "startDate" IS NULL OR "endDate" IS NULL;

-- 5) Scope: existing offers always had explicit products
UPDATE "Offer" SET "appliesTo" = COALESCE("appliesTo", 'selected_products');

-- 6) Status remap: scheduled/inactive → draft/archived; keep active; mark past end as expired
UPDATE "Offer"
SET "status" = CASE
  WHEN "status" IN ('active') AND "endDate" < NOW() THEN 'expired'
  WHEN "status" IN ('active') THEN 'active'
  WHEN "status" IN ('scheduled') THEN 'draft'
  WHEN "status" IN ('inactive', 'expired') THEN
    CASE WHEN "endDate" < NOW() THEN 'expired' ELSE 'archived' END
  WHEN "status" IN ('draft', 'archived', 'expired') THEN "status"
  ELSE 'draft'
END;

-- 7) Drop old indexes / columns / related tables
DROP INDEX IF EXISTS "Offer_type_idx";

ALTER TABLE "Offer" DROP COLUMN IF EXISTS "name";
ALTER TABLE "Offer" DROP COLUMN IF EXISTS "type";

DROP TABLE IF EXISTS "OfferDiscountType";
DROP TABLE IF EXISTS "DateRange";

-- 8) Enforce NOT NULL on new required columns
ALTER TABLE "Offer" ALTER COLUMN "title" SET NOT NULL;
ALTER TABLE "Offer" ALTER COLUMN "discountType" SET NOT NULL;
ALTER TABLE "Offer" ALTER COLUMN "discountValue" SET NOT NULL;
ALTER TABLE "Offer" ALTER COLUMN "appliesTo" SET NOT NULL;
ALTER TABLE "Offer" ALTER COLUMN "startDate" SET NOT NULL;
ALTER TABLE "Offer" ALTER COLUMN "endDate" SET NOT NULL;
ALTER TABLE "Offer" ALTER COLUMN "status" SET DEFAULT 'draft';

CREATE INDEX IF NOT EXISTS "Offer_appliesTo_idx" ON "Offer"("appliesTo");
CREATE INDEX IF NOT EXISTS "Offer_categorySlug_idx" ON "Offer"("categorySlug");
CREATE INDEX IF NOT EXISTS "Offer_startDate_endDate_idx" ON "Offer"("startDate", "endDate");

-- Pivot Offer to per-retailer (per-client) pricing.
-- Old blanket promotions cannot map to a required buyerId, so existing rows are deleted.

-- 1) Wipe existing Offer rows (blanket offers have no client target)
DELETE FROM "Offer";

-- 2) Drop OfferProduct join table (product targeting is now Offer.productId)
DROP TABLE IF EXISTS "OfferProduct";

-- 3) Drop blanket-promotion columns if present
DROP INDEX IF EXISTS "Offer_appliesTo_idx";
DROP INDEX IF EXISTS "Offer_categorySlug_idx";

ALTER TABLE "Offer" DROP COLUMN IF EXISTS "title";
ALTER TABLE "Offer" DROP COLUMN IF EXISTS "appliesTo";
ALTER TABLE "Offer" DROP COLUMN IF EXISTS "categorySlug";

-- 4) Add per-retailer columns
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "buyerId" TEXT;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "productId" TEXT;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "categoryId" TEXT;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "notes" TEXT;

-- 5) Make endDate nullable (null = standing / indefinite)
ALTER TABLE "Offer" ALTER COLUMN "endDate" DROP NOT NULL;

-- 6) Enforce buyerId NOT NULL after wipe (no orphan rows)
ALTER TABLE "Offer" ALTER COLUMN "buyerId" SET NOT NULL;

-- 7) Foreign keys
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Offer_buyerId_fkey'
  ) THEN
    ALTER TABLE "Offer"
      ADD CONSTRAINT "Offer_buyerId_fkey"
      FOREIGN KEY ("buyerId") REFERENCES "Buyer"("buyerId")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Offer_productId_fkey'
  ) THEN
    ALTER TABLE "Offer"
      ADD CONSTRAINT "Offer_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("productId")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 8) Indexes matching Prisma schema
CREATE INDEX IF NOT EXISTS "Offer_buyerId_idx" ON "Offer"("buyerId");
CREATE INDEX IF NOT EXISTS "Offer_productId_idx" ON "Offer"("productId");
CREATE INDEX IF NOT EXISTS "Offer_categoryId_idx" ON "Offer"("categoryId");
CREATE INDEX IF NOT EXISTS "Offer_userId_buyerId_idx" ON "Offer"("userId", "buyerId");
CREATE INDEX IF NOT EXISTS "Offer_userId_productId_idx" ON "Offer"("userId", "productId");
CREATE INDEX IF NOT EXISTS "Offer_startDate_endDate_idx" ON "Offer"("startDate", "endDate");

-- 9) Enable RLS (defense-in-depth; Prisma service role bypasses)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'Offer'
  ) THEN
    ALTER TABLE "Offer" ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'Offer'
        AND policyname = 'Allow offer operations'
    ) THEN
      CREATE POLICY "Allow offer operations"
        ON "Offer" FOR ALL
        USING (true)
        WITH CHECK (true);
    END IF;
  END IF;
END $$;

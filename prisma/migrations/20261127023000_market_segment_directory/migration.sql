-- Market segment directory owns main-channel pricing independently of buyers.

ALTER TABLE "Buyer" ADD COLUMN IF NOT EXISTS "subChannel" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Buyer" ADD COLUMN IF NOT EXISTS "outletExamples" TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS "MarketSegmentDirectory" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "mainChannel" TEXT NOT NULL,
  "subChannel" TEXT NOT NULL DEFAULT '',
  "outletExamples" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketSegmentDirectory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MarketSegmentDirectory_userId_mainChannel_subChannel_key"
  ON "MarketSegmentDirectory"("userId", "mainChannel", "subChannel");
CREATE INDEX IF NOT EXISTS "MarketSegmentDirectory_userId_idx"
  ON "MarketSegmentDirectory"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MarketSegmentDirectory_userId_fkey'
  ) THEN
    ALTER TABLE "MarketSegmentDirectory"
      ADD CONSTRAINT "MarketSegmentDirectory_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION "Buyer_clear_orphan_segment_prices"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  distributor_id integer;
  segment_key text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    distributor_id := OLD."userId";
    segment_key := lower(trim(COALESCE(OLD."businessType", '')));
  ELSIF TG_OP = 'UPDATE' THEN
    IF lower(trim(COALESCE(NEW."businessType", ''))) = lower(trim(COALESCE(OLD."businessType", '')))
       AND NEW."userId" IS NOT DISTINCT FROM OLD."userId" THEN
      RETURN NEW;
    END IF;
    distributor_id := OLD."userId";
    segment_key := lower(trim(COALESCE(OLD."businessType", '')));
  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF distributor_id IS NULL OR segment_key = '' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Buyer" b
    WHERE b."userId" = distributor_id
      AND lower(trim(COALESCE(b."businessType", ''))) = segment_key
  ) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Directory still owns this main channel → keep product segment prices.
  IF EXISTS (
    SELECT 1
    FROM "MarketSegmentDirectory" d
    WHERE d."userId" = distributor_id
      AND lower(trim(COALESCE(d."mainChannel", ''))) = segment_key
  ) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  DELETE FROM "VariantSegmentPrice" vsp
  USING "VariantOption" vo
  INNER JOIN "Product" p ON p.id = vo."productId"
  WHERE vsp."variantOptionId" = vo.id
    AND vsp."segmentKey" = segment_key
    AND p."userId" = distributor_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

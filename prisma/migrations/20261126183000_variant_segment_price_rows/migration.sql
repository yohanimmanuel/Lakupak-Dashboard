-- Relational market-segment prices (replaces VariantOption.segmentPrices JSON).
CREATE TABLE IF NOT EXISTS "VariantSegmentPrice" (
    "id" SERIAL NOT NULL,
    "variantOptionId" INTEGER NOT NULL,
    "segmentKey" TEXT NOT NULL,
    "sellingPrice" DECIMAL(18,6) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "VariantSegmentPrice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "VariantSegmentPrice_variantOptionId_segmentKey_key"
  ON "VariantSegmentPrice"("variantOptionId", "segmentKey");
CREATE INDEX IF NOT EXISTS "VariantSegmentPrice_variantOptionId_idx"
  ON "VariantSegmentPrice"("variantOptionId");
CREATE INDEX IF NOT EXISTS "VariantSegmentPrice_segmentKey_idx"
  ON "VariantSegmentPrice"("segmentKey");

ALTER TABLE "VariantSegmentPrice"
  DROP CONSTRAINT IF EXISTS "VariantSegmentPrice_variantOptionId_fkey";
ALTER TABLE "VariantSegmentPrice"
  ADD CONSTRAINT "VariantSegmentPrice_variantOptionId_fkey"
  FOREIGN KEY ("variantOptionId") REFERENCES "VariantOption"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Copy any existing JSON map entries into rows before dropping the column.
DO $$
DECLARE
  r RECORD;
  key TEXT;
  val TEXT;
  price NUMERIC;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'VariantOption' AND column_name = 'segmentPrices'
  ) THEN
    FOR r IN SELECT id, "segmentPrices" FROM "VariantOption" WHERE "segmentPrices" IS NOT NULL LOOP
      FOR key, val IN SELECT * FROM jsonb_each_text(r."segmentPrices"::jsonb) LOOP
        BEGIN
          price := NULLIF(trim(val), '')::numeric;
        EXCEPTION WHEN others THEN
          price := NULL;
        END;
        IF price IS NOT NULL AND price > 0 AND length(trim(key)) > 0 THEN
          INSERT INTO "VariantSegmentPrice" ("variantOptionId", "segmentKey", "sellingPrice", "createdAt", "updatedAt")
          VALUES (r.id, lower(trim(key)), round(price::numeric, 6), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT ("variantOptionId", "segmentKey") DO UPDATE
            SET "sellingPrice" = EXCLUDED."sellingPrice", "updatedAt" = CURRENT_TIMESTAMP;
        END IF;
      END LOOP;
    END LOOP;
  END IF;
END $$;

ALTER TABLE "VariantOption" DROP COLUMN IF EXISTS "segmentPrices";
-- Add optional variant scope to Offer (null = whole product / all variants)

ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "variantOptionId" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Offer_variantOptionId_fkey'
  ) THEN
    ALTER TABLE "Offer"
      ADD CONSTRAINT "Offer_variantOptionId_fkey"
      FOREIGN KEY ("variantOptionId") REFERENCES "VariantOption"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "Offer_variantOptionId_idx" ON "Offer"("variantOptionId");

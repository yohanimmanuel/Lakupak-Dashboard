-- Explicit receipt corrections may replace product/variant identity in-place.
-- A receipt's stable suppliesno/id and applied movement target remain separate.
-- The application validates ownership and calculates stock deltas transactionally.
CREATE OR REPLACE FUNCTION preserve_supply_variant_identity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."variantOptionId" IS NOT NULL THEN
      IF NEW."historicalVariantOptionId" IS NOT NULL
         AND NEW."historicalVariantOptionId" <> NEW."variantOptionId" THEN
        RAISE EXCEPTION 'Supply variant identity mismatch';
      END IF;
      NEW."historicalVariantOptionId" := NEW."variantOptionId";
    END IF;
  ELSE
    IF NEW."variantOptionId" IS DISTINCT FROM OLD."variantOptionId"
       AND NEW."variantOptionId" IS NOT NULL THEN
      IF OLD."archivedAt" IS NOT NULL THEN
        RAISE EXCEPTION 'Archived supply must be restored before correction';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM "VariantOption" v
        WHERE v."id" = NEW."variantOptionId" AND v."isActive" = true
      ) THEN
        RAISE EXCEPTION 'Corrected supply variant is not active';
      END IF;
      NEW."historicalVariantOptionId" := NEW."variantOptionId";
    ELSIF NEW."historicalVariantOptionId" IS DISTINCT FROM OLD."historicalVariantOptionId" THEN
      RAISE EXCEPTION 'Historical supply identity cannot change without a new live variant';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

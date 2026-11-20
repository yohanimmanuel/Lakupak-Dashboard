-- Keep historical receipt identity immutable. A deleted variant's receipt
-- must remain a snapshot: new catalog variants require new supply receipts.
-- Replaces the earlier permissive function on this feature branch.
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
    IF OLD."historicalVariantOptionId" IS NOT NULL THEN
      IF NEW."historicalVariantOptionId" IS DISTINCT FROM OLD."historicalVariantOptionId" THEN
        RAISE EXCEPTION 'Historical supply variant identity cannot be changed';
      END IF;
      IF NEW."variantOptionId" IS NOT NULL
         AND NEW."variantOptionId" <> OLD."historicalVariantOptionId" THEN
        RAISE EXCEPTION 'Cannot reattach supply to another catalog variant';
      END IF;
    ELSIF NEW."variantOptionId" IS NOT NULL THEN
      NEW."historicalVariantOptionId" := NEW."variantOptionId";
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

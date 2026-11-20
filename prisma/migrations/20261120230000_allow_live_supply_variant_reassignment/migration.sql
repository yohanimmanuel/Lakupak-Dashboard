-- Historical identity is immutable. Only receipts still attached to a live
-- catalog variant may be explicitly reassigned to another live variant.
-- Deleted originals (FK set NULL) remain frozen even if the SKU is recreated.
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
    IF OLD."historicalVariantOptionId" IS NOT NULL
       AND NEW."historicalVariantOptionId" IS DISTINCT FROM OLD."historicalVariantOptionId" THEN
      RAISE EXCEPTION 'Historical supply variant identity cannot be changed';
    END IF;

    IF NEW."variantOptionId" IS DISTINCT FROM OLD."variantOptionId"
       AND NEW."variantOptionId" IS NOT NULL THEN
      IF OLD."variantOptionId" IS NULL OR OLD."archivedAt" IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot reattach supply whose original catalog variant is unavailable';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM "VariantOption" v WHERE v."id" = OLD."variantOptionId" AND v."isActive" = true) THEN
        RAISE EXCEPTION 'Cannot reattach supply whose original catalog variant is unavailable';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM "VariantOption" v WHERE v."id" = NEW."variantOptionId" AND v."isActive" = true) THEN
        RAISE EXCEPTION 'Replacement catalog variant does not exist';
      END IF;
    END IF;

    IF OLD."historicalVariantOptionId" IS NULL AND NEW."variantOptionId" IS NOT NULL THEN
      NEW."historicalVariantOptionId" := NEW."variantOptionId";
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

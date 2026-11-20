-- Keep the original supply variant snapshot immutable, while permitting a
-- separately validated live catalog link to be changed by supplier editing.
-- This replaces the guard function; it does not rewrite historical IDs.
CREATE OR REPLACE FUNCTION preserve_supply_variant_identity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."variantOptionId" IS NOT NULL THEN
      IF NEW."historicalVariantOptionId" IS NULL THEN
        NEW."historicalVariantOptionId" := NEW."variantOptionId";
      END IF;
    END IF;
  ELSE
    IF OLD."historicalVariantOptionId" IS NOT NULL THEN
      IF NEW."historicalVariantOptionId" IS DISTINCT FROM OLD."historicalVariantOptionId" THEN
        RAISE EXCEPTION 'Historical supply variant identity cannot be changed';
      END IF;
    ELSIF NEW."variantOptionId" IS NOT NULL THEN
      -- A legacy receipt may acquire its first durable historical identity.
      -- Later relinks do not overwrite this snapshot.
      NEW."historicalVariantOptionId" := COALESCE(NEW."historicalVariantOptionId", NEW."variantOptionId");
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

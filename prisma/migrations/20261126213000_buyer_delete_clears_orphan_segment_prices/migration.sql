-- When the last buyer of a market segment is removed (app or raw SQL),
-- drop that segment's VariantSegmentPrice rows so catalog falls back to default.

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
    -- Only when businessType changes away from the old segment.
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

  -- Another buyer still owns this segment for the distributor → keep prices.
  IF EXISTS (
    SELECT 1
    FROM "Buyer" b
    WHERE b."userId" = distributor_id
      AND lower(trim(COALESCE(b."businessType", ''))) = segment_key
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

DROP TRIGGER IF EXISTS "Buyer_clear_orphan_segment_prices_delete" ON "Buyer";
CREATE TRIGGER "Buyer_clear_orphan_segment_prices_delete"
AFTER DELETE ON "Buyer"
FOR EACH ROW
EXECUTE FUNCTION "Buyer_clear_orphan_segment_prices"();

DROP TRIGGER IF EXISTS "Buyer_clear_orphan_segment_prices_update" ON "Buyer";
CREATE TRIGGER "Buyer_clear_orphan_segment_prices_update"
AFTER UPDATE OF "businessType", "userId" ON "Buyer"
FOR EACH ROW
EXECUTE FUNCTION "Buyer_clear_orphan_segment_prices"();

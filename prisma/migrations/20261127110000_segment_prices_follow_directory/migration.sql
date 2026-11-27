-- Buyer delete/update must not drop VariantSegmentPrice.
-- Prices are removed only when a main channel is gone from MarketSegmentDirectory.

CREATE OR REPLACE FUNCTION "Buyer_clear_orphan_segment_prices"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN COALESCE(NEW, OLD);
END;
$$;

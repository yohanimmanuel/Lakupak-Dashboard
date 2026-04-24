-- Enable RLS for app sessions and marketplace search telemetry/config.
-- Consistent with existing repository approach: defense-in-depth only.
-- Application/API layer enforces real authorization.

-- ============================================================================
-- APP SESSION SAMPLE
-- ============================================================================
ALTER TABLE "AppSessionSample" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Application can manage app session samples"
  ON "AppSessionSample" FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- MARKETPLACE SEARCH QUERY LOG (raw telemetry)
-- ============================================================================
ALTER TABLE "MarketplaceSearchQueryLog" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Application can manage marketplace search query logs"
  ON "MarketplaceSearchQueryLog" FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- MARKETPLACE SEARCH TERM MAP (curated config)
-- ============================================================================
ALTER TABLE "MarketplaceSearchTermMap" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Application can manage marketplace search term maps"
  ON "MarketplaceSearchTermMap" FOR ALL
  USING (true)
  WITH CHECK (true);


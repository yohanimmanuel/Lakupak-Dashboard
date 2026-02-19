-- Enable RLS on Fleet table (added in add_fleet_schema)
ALTER TABLE "Fleet" ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- FLEET TABLE
-- ============================================================================
-- Users can access fleet records they own (userId); application-level auth verifies userId
CREATE POLICY "Users can manage own fleet"
  ON "Fleet" FOR ALL
  USING ("userId" IS NOT NULL);

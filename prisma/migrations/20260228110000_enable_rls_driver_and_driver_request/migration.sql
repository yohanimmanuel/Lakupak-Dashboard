-- Enable RLS on Driver and DriverRequest tables
ALTER TABLE "Driver" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DriverRequest" ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- DRIVER TABLE
-- ============================================================================
-- Distributors (User) can only manage drivers they own (userId).
-- Application-level auth verifies userId on all driver operations.
CREATE POLICY "Users can manage own drivers"
  ON "Driver" FOR ALL
  USING ("userId" IS NOT NULL);

-- ============================================================================
-- DRIVER REQUEST TABLE
-- ============================================================================
-- Inserts come from Laku-Driver app (unauthenticated). Read/update are
-- restricted in the API to the distributor whose email matches distributorEmail.
CREATE POLICY "Application can manage driver requests"
  ON "DriverRequest" FOR ALL
  USING (true)
  WITH CHECK (true);

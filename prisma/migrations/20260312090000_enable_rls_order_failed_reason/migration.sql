-- Enable RLS on OrderFailedReason table (driver-reported delivery failures)
ALTER TABLE "OrderFailedReason" ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- ORDER FAILED REASON (Distributor Dashboard & internal services)
-- ============================================================================
-- Access is always mediated by the application using the distributor's userId;
-- we don't expose this table directly to untrusted clients. Allow all operations
-- under RLS, but in practice APIs still scope by order/user.
CREATE POLICY "Application can manage order failed reasons"
  ON "OrderFailedReason" FOR ALL
  USING (true)
  WITH CHECK (true);


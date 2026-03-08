-- Enable RLS on new schemas added after initial RLS setup
ALTER TABLE "OrderCancellation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderReturnRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MarketplacePasswordResetToken" ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- ORDER CANCELLATION (MarketplaceUser = buyer who cancelled)
-- ============================================================================
CREATE POLICY "Application can manage order cancellations"
  ON "OrderCancellation" FOR ALL
  USING ("marketplaceUserId" IS NOT NULL); -- Application-level auth verifies marketplace user

-- ============================================================================
-- ORDER RETURN REQUEST (MarketplaceUser = buyer who requested return)
-- ============================================================================
CREATE POLICY "Application can manage order return requests"
  ON "OrderReturnRequest" FOR ALL
  USING ("marketplaceUserId" IS NOT NULL); -- Application-level auth verifies marketplace user

-- ============================================================================
-- MARKETPLACE PASSWORD RESET TOKEN
-- ============================================================================
-- Allow all operations (temporary tokens; API controls create/verify/delete)
CREATE POLICY "Allow password reset token operations"
  ON "MarketplacePasswordResetToken" FOR ALL
  USING (true); -- Application-level auth in forgot-password/reset-password APIs

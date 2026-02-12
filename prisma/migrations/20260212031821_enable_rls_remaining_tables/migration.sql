-- Enable RLS on tables that were added after the initial RLS migration
ALTER TABLE "SearchHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PushNotificationToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductReview" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderDeliveryReview" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DistributorReview" ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- SEARCH HISTORY (MarketplaceUser)
-- ============================================================================
CREATE POLICY "Marketplace users can manage own search history"
  ON "SearchHistory" FOR ALL
  USING ("userId" IS NOT NULL);

-- ============================================================================
-- NOTIFICATION (Dashboard User)
-- ============================================================================
CREATE POLICY "Users can manage own notifications"
  ON "Notification" FOR ALL
  USING ("userId" IS NOT NULL);

-- ============================================================================
-- PUSH NOTIFICATION TOKEN (MarketplaceUser)
-- ============================================================================
CREATE POLICY "Marketplace users can manage own push tokens"
  ON "PushNotificationToken" FOR ALL
  USING ("userId" IS NOT NULL);

-- ============================================================================
-- PRODUCT REVIEW (MarketplaceUser = reviewer)
-- ============================================================================
CREATE POLICY "Marketplace users can manage own product reviews"
  ON "ProductReview" FOR ALL
  USING ("userId" IS NOT NULL);

-- ============================================================================
-- ORDER DELIVERY REVIEW (MarketplaceUser = reviewer)
-- ============================================================================
CREATE POLICY "Marketplace users can manage own delivery reviews"
  ON "OrderDeliveryReview" FOR ALL
  USING ("userId" IS NOT NULL);

-- ============================================================================
-- DISTRIBUTOR REVIEW (MarketplaceUser = reviewer, User = distributor)
-- ============================================================================
CREATE POLICY "Marketplace users can manage own distributor reviews"
  ON "DistributorReview" FOR ALL
  USING ("userId" IS NOT NULL);

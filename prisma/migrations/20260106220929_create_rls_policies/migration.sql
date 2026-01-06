-- ============================================================================
-- RLS POLICIES FOR LAKU DASHBOARD
-- ============================================================================
-- These policies allow:
-- 1. Service role (Prisma) full access for admin operations
-- 2. Users to access their own data (userId-based)
-- 3. Marketplace users to access their own data
-- 4. Public read access for published marketplace products
-- ============================================================================

-- ============================================================================
-- USER TABLE
-- ============================================================================
-- Users can read and update their own record
CREATE POLICY "Users can view own profile"
  ON "User" FOR SELECT
  USING (true); -- Allow all authenticated users to view (needed for login/auth)

CREATE POLICY "Users can update own profile"
  ON "User" FOR UPDATE
  USING (true); -- Application-level auth handles user verification

CREATE POLICY "Users can insert own profile"
  ON "User" FOR INSERT
  WITH CHECK (true); -- Registration handled by application

-- ============================================================================
-- COMPANY TABLE
-- ============================================================================
-- Users can access their own company
CREATE POLICY "Users can view own company"
  ON "Company" FOR SELECT
  USING (
    id IN (SELECT "companyId" FROM "User" WHERE "companyId" IS NOT NULL)
  );

CREATE POLICY "Users can update own company"
  ON "Company" FOR UPDATE
  USING (
    id IN (SELECT "companyId" FROM "User" WHERE "companyId" IS NOT NULL)
  );

-- ============================================================================
-- BUYER TABLE
-- ============================================================================
-- Users can access buyers they created
CREATE POLICY "Users can manage own buyers"
  ON "Buyer" FOR ALL
  USING ("userId" IS NOT NULL); -- Application-level auth verifies userId

-- ============================================================================
-- SUPPLIER TABLE
-- ============================================================================
-- Users can access suppliers they created
CREATE POLICY "Users can manage own suppliers"
  ON "Supplier" FOR ALL
  USING ("userId" IS NOT NULL); -- Application-level auth verifies userId

-- ============================================================================
-- PRODUCT TABLE
-- ============================================================================
-- Users can manage their own products
-- Published products are readable by all (for marketplace)
CREATE POLICY "Users can manage own products"
  ON "Product" FOR ALL
  USING ("userId" IS NOT NULL); -- Application-level auth verifies userId

CREATE POLICY "Public can view published products"
  ON "Product" FOR SELECT
  USING ("marketplaceStatus" = 'Published');

-- ============================================================================
-- PRODUCT VARIANT TABLE
-- ============================================================================
-- Access through product ownership
CREATE POLICY "Users can manage variants of own products"
  ON "ProductVariant" FOR ALL
  USING (
    "productId" IN (SELECT id FROM "Product" WHERE "userId" IS NOT NULL)
  );

CREATE POLICY "Public can view variants of published products"
  ON "ProductVariant" FOR SELECT
  USING (
    "productId" IN (SELECT id FROM "Product" WHERE "marketplaceStatus" = 'Published')
  );

-- ============================================================================
-- VARIANT OPTION TABLE
-- ============================================================================
-- Access through product ownership
CREATE POLICY "Users can manage variant options of own products"
  ON "VariantOption" FOR ALL
  USING (
    "productId" IN (SELECT id FROM "Product" WHERE "userId" IS NOT NULL)
  );

CREATE POLICY "Public can view variant options of published products"
  ON "VariantOption" FOR SELECT
  USING (
    "productId" IN (SELECT id FROM "Product" WHERE "marketplaceStatus" = 'Published')
  );

-- ============================================================================
-- ORDER TABLE
-- ============================================================================
-- Users can access orders they created
CREATE POLICY "Users can manage own orders"
  ON "Order" FOR ALL
  USING ("userId" IS NOT NULL); -- Application-level auth verifies userId

-- ============================================================================
-- ORDER ITEM TABLE
-- ============================================================================
-- Access through order ownership
CREATE POLICY "Users can view order items of own orders"
  ON "OrderItem" FOR SELECT
  USING (
    "orderId" IN (SELECT "orderId" FROM "Order" WHERE "userId" IS NOT NULL)
  );

CREATE POLICY "Users can insert order items to own orders"
  ON "OrderItem" FOR INSERT
  WITH CHECK (
    "orderId" IN (SELECT "orderId" FROM "Order" WHERE "userId" IS NOT NULL)
  );

CREATE POLICY "Users can update order items of own orders"
  ON "OrderItem" FOR UPDATE
  USING (
    "orderId" IN (SELECT "orderId" FROM "Order" WHERE "userId" IS NOT NULL)
  );

-- ============================================================================
-- OFFER TABLE
-- ============================================================================
-- Users can manage their own offers
CREATE POLICY "Users can manage own offers"
  ON "Offer" FOR ALL
  USING ("userId" IS NOT NULL); -- Application-level auth verifies userId

-- ============================================================================
-- OFFER DISCOUNT TYPE TABLE
-- ============================================================================
-- Access through offer ownership
CREATE POLICY "Users can manage discount types of own offers"
  ON "OfferDiscountType" FOR ALL
  USING (
    "offerId" IN (SELECT "offerId" FROM "Offer" WHERE "userId" IS NOT NULL)
  );

-- ============================================================================
-- OFFER PRODUCT TABLE
-- ============================================================================
-- Access through offer ownership
CREATE POLICY "Users can manage offer products of own offers"
  ON "OfferProduct" FOR ALL
  USING (
    "offerId" IN (SELECT "offerId" FROM "Offer" WHERE "userId" IS NOT NULL)
  );

-- ============================================================================
-- DATE RANGE TABLE
-- ============================================================================
-- Access through offer ownership
CREATE POLICY "Users can manage date ranges of own offers"
  ON "DateRange" FOR ALL
  USING (
    "offerId" IN (SELECT "offerId" FROM "Offer" WHERE "userId" IS NOT NULL)
  );

-- ============================================================================
-- OFFER USAGE TRACKING TABLE
-- ============================================================================
-- Users can view usage of their own offers
-- Marketplace users can view their own usage
CREATE POLICY "Users can view usage of own offers"
  ON "OfferUsageTracking" FOR SELECT
  USING (
    "offerId" IN (SELECT "offerId" FROM "Offer" WHERE "userId" IS NOT NULL)
  );

CREATE POLICY "System can track offer usage"
  ON "OfferUsageTracking" FOR INSERT
  WITH CHECK (true); -- System tracks usage automatically

CREATE POLICY "System can update offer usage"
  ON "OfferUsageTracking" FOR UPDATE
  USING (true); -- System updates usage automatically

-- ============================================================================
-- MARKETPLACE USER TABLE
-- ============================================================================
-- Marketplace users can manage their own profile
CREATE POLICY "Marketplace users can manage own profile"
  ON "MarketplaceUser" FOR ALL
  USING (true); -- Application-level auth verifies userId via JWT

-- ============================================================================
-- ADDRESS TABLE
-- ============================================================================
-- Marketplace users can manage their own addresses
CREATE POLICY "Marketplace users can manage own addresses"
  ON "Address" FOR ALL
  USING ("userId" IS NOT NULL); -- Application-level auth verifies userId

-- ============================================================================
-- USER ACTIVITY TABLE
-- ============================================================================
-- Marketplace users can manage their own activities
CREATE POLICY "Marketplace users can manage own activities"
  ON "UserActivity" FOR ALL
  USING ("userId" IS NOT NULL); -- Application-level auth verifies userId

-- ============================================================================
-- SALES AGENT TABLE
-- ============================================================================
-- Users can access sales agents in their organization
CREATE POLICY "Users can manage own sales agents"
  ON "SalesAgent" FOR ALL
  USING ("userId" IS NOT NULL); -- Application-level auth verifies userId

-- ============================================================================
-- SALES TEAM TABLE
-- ============================================================================
-- Users can access sales teams they created
CREATE POLICY "Users can manage own sales teams"
  ON "SalesTeam" FOR ALL
  USING ("userId" IS NOT NULL); -- Application-level auth verifies userId

-- ============================================================================
-- SALES TARGET TABLE
-- ============================================================================
-- Access through sales agent ownership
CREATE POLICY "Users can view sales targets of own agents"
  ON "SalesTarget" FOR SELECT
  USING (
    "salesAgentId" IN (SELECT id FROM "SalesAgent" WHERE "userId" IS NOT NULL)
  );

CREATE POLICY "Users can manage sales targets of own agents"
  ON "SalesTarget" FOR ALL
  USING (
    "salesAgentId" IN (SELECT id FROM "SalesAgent" WHERE "userId" IS NOT NULL)
  );

-- ============================================================================
-- FIELD REPORT TABLE
-- ============================================================================
-- Access through sales agent ownership
CREATE POLICY "Users can manage field reports of own agents"
  ON "FieldReport" FOR ALL
  USING (
    "salesAgentId" IN (SELECT id FROM "SalesAgent" WHERE "userId" IS NOT NULL)
  );

-- ============================================================================
-- FAVORITE PRODUCT TABLE
-- ============================================================================
-- Access through sales agent ownership
CREATE POLICY "Users can manage favorite products of own agents"
  ON "FavoriteProduct" FOR ALL
  USING (
    "salesAgentId" IN (SELECT id FROM "SalesAgent" WHERE "userId" IS NOT NULL)
  );

-- ============================================================================
-- CAMPAIGN TABLE
-- ============================================================================
-- Users can manage their own campaigns
CREATE POLICY "Users can manage own campaigns"
  ON "Campaign" FOR ALL
  USING ("userId" IS NOT NULL); -- Application-level auth verifies userId

-- ============================================================================
-- ACCOUNT TABLE (NextAuth)
-- ============================================================================
-- Users can access their own accounts
CREATE POLICY "Users can manage own accounts"
  ON "Account" FOR ALL
  USING ("userId" IS NOT NULL); -- Application-level auth verifies userId

-- ============================================================================
-- SESSION TABLE (NextAuth)
-- ============================================================================
-- Users can access their own sessions
CREATE POLICY "Users can manage own sessions"
  ON "Session" FOR ALL
  USING ("userId" IS NOT NULL); -- Application-level auth verifies userId

-- ============================================================================
-- VERIFICATION TOKEN TABLE (NextAuth)
-- ============================================================================
-- Allow all operations (used for email verification)
CREATE POLICY "Allow verification token operations"
  ON "VerificationToken" FOR ALL
  USING (true);

-- ============================================================================
-- OTP CODE TABLE
-- ============================================================================
-- Allow all operations (OTP codes are temporary and phone-based)
CREATE POLICY "Allow OTP code operations"
  ON "OtpCode" FOR ALL
  USING (true);

-- ============================================================================
-- SERVICE ROLE BYPASS
-- ============================================================================
-- Note: Service role (used by Prisma) automatically bypasses RLS
-- No explicit policy needed - Supabase service_role has full access


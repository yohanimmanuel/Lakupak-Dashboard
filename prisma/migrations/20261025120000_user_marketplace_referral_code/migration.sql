ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "marketplaceReferralCode" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "User_marketplaceReferralCode_key" ON "User"("marketplaceReferralCode");

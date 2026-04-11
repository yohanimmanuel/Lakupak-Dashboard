-- AlterTable (IF NOT EXISTS: safe if columns were added manually or migration re-run)
ALTER TABLE "MarketplaceHomeOffer" ADD COLUMN IF NOT EXISTS "bannerImageUrl" TEXT;
ALTER TABLE "MarketplaceHomeOffer" ADD COLUMN IF NOT EXISTS "rightIconKey" TEXT NOT NULL DEFAULT 'gift';
ALTER TABLE "MarketplaceHomeOffer" ADD COLUMN IF NOT EXISTS "discountIconKey" TEXT NOT NULL DEFAULT 'flash';

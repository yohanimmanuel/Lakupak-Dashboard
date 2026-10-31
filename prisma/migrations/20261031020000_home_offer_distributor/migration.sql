-- Campaign banners belong to one distributor storefront.

ALTER TABLE "MarketplaceHomeOffer" ADD COLUMN "userId" INTEGER;

CREATE INDEX "MarketplaceHomeOffer_userId_isPublished_sortOrder_idx" ON "MarketplaceHomeOffer"("userId", "isPublished", "sortOrder");

ALTER TABLE "MarketplaceHomeOffer" ADD CONSTRAINT "MarketplaceHomeOffer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

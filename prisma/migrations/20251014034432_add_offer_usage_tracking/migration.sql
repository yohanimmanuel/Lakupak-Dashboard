-- CreateTable
CREATE TABLE "public"."OfferUsageTracking" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "buyerId" TEXT,
    "marketplaceUserId" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 1,
    "lastUsedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OfferUsageTracking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OfferUsageTracking_offerId_idx" ON "public"."OfferUsageTracking"("offerId");

-- CreateIndex
CREATE INDEX "OfferUsageTracking_buyerId_idx" ON "public"."OfferUsageTracking"("buyerId");

-- CreateIndex
CREATE INDEX "OfferUsageTracking_marketplaceUserId_idx" ON "public"."OfferUsageTracking"("marketplaceUserId");

-- CreateIndex
CREATE UNIQUE INDEX "OfferUsageTracking_offerId_buyerId_key" ON "public"."OfferUsageTracking"("offerId", "buyerId");

-- CreateIndex
CREATE UNIQUE INDEX "OfferUsageTracking_offerId_marketplaceUserId_key" ON "public"."OfferUsageTracking"("offerId", "marketplaceUserId");

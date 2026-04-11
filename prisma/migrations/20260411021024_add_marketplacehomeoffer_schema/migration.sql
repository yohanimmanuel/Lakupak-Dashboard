-- CreateTable
CREATE TABLE "MarketplaceHomeOffer" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL DEFAULT '',
    "discountText" TEXT NOT NULL DEFAULT '',
    "endDateText" TEXT NOT NULL DEFAULT '',
    "backgroundColor" TEXT NOT NULL DEFAULT '#0a61d7',
    "textColor" TEXT NOT NULL DEFAULT '#FFFFFF',
    "detailsBody" TEXT NOT NULL DEFAULT '',
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMPTZ(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByAdminId" INTEGER,

    CONSTRAINT "MarketplaceHomeOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketplaceHomeOffer_isPublished_sortOrder_publishedAt_idx" ON "MarketplaceHomeOffer"("isPublished", "sortOrder", "publishedAt");

-- AddForeignKey
ALTER TABLE "MarketplaceHomeOffer" ADD CONSTRAINT "MarketplaceHomeOffer_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "PlatformAdmin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

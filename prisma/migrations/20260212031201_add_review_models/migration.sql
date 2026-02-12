-- CreateTable
CREATE TABLE "ProductReview" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "comment" TEXT,
    "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProductReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderDeliveryReview" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "orderId" TEXT NOT NULL,
    "deliveryRating" INTEGER,
    "deliveryComment" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderDeliveryReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistributorReview" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "distributorId" INTEGER NOT NULL,
    "orderId" TEXT,
    "overallRating" INTEGER NOT NULL,
    "communicationRating" INTEGER,
    "deliveryRating" INTEGER,
    "productQualityRating" INTEGER,
    "wouldOrderAgain" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DistributorReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductReview_productId_idx" ON "ProductReview"("productId");

-- CreateIndex
CREATE INDEX "ProductReview_orderId_idx" ON "ProductReview"("orderId");

-- CreateIndex
CREATE INDEX "ProductReview_userId_idx" ON "ProductReview"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductReview_userId_orderId_productId_key" ON "ProductReview"("userId", "orderId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderDeliveryReview_orderId_key" ON "OrderDeliveryReview"("orderId");

-- CreateIndex
CREATE INDEX "OrderDeliveryReview_userId_idx" ON "OrderDeliveryReview"("userId");

-- CreateIndex
CREATE INDEX "OrderDeliveryReview_orderId_idx" ON "OrderDeliveryReview"("orderId");

-- CreateIndex
CREATE INDEX "DistributorReview_distributorId_idx" ON "DistributorReview"("distributorId");

-- CreateIndex
CREATE INDEX "DistributorReview_userId_idx" ON "DistributorReview"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DistributorReview_userId_distributorId_key" ON "DistributorReview"("userId", "distributorId");

-- AddForeignKey
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "MarketplaceUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("orderId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("productId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderDeliveryReview" ADD CONSTRAINT "OrderDeliveryReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "MarketplaceUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderDeliveryReview" ADD CONSTRAINT "OrderDeliveryReview_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("orderId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributorReview" ADD CONSTRAINT "DistributorReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "MarketplaceUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributorReview" ADD CONSTRAINT "DistributorReview_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

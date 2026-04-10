-- CreateTable
CREATE TABLE "DistributorFollowing" (
    "id" SERIAL NOT NULL,
    "marketplaceUserId" INTEGER NOT NULL,
    "distributorId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DistributorFollowing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DistributorFollowing_marketplaceUserId_idx" ON "DistributorFollowing"("marketplaceUserId");

-- CreateIndex
CREATE INDEX "DistributorFollowing_distributorId_idx" ON "DistributorFollowing"("distributorId");

-- CreateIndex
CREATE INDEX "DistributorFollowing_createdAt_idx" ON "DistributorFollowing"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DistributorFollowing_marketplaceUserId_distributorId_key" ON "DistributorFollowing"("marketplaceUserId", "distributorId");

-- AddForeignKey
ALTER TABLE "DistributorFollowing" ADD CONSTRAINT "DistributorFollowing_marketplaceUserId_fkey" FOREIGN KEY ("marketplaceUserId") REFERENCES "MarketplaceUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributorFollowing" ADD CONSTRAINT "DistributorFollowing_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


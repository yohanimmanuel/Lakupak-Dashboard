-- CreateTable
CREATE TABLE "DistributorReport" (
    "id" SERIAL NOT NULL,
    "reportedDashboardUserId" INTEGER NOT NULL,
    "reporterMarketplaceUserId" INTEGER NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "reasonText" TEXT NOT NULL,
    "reasonDetail" TEXT,
    "adminReadAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DistributorReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DistributorReport_reportedDashboardUserId_idx" ON "DistributorReport"("reportedDashboardUserId");

-- CreateIndex
CREATE INDEX "DistributorReport_reporterMarketplaceUserId_idx" ON "DistributorReport"("reporterMarketplaceUserId");

-- CreateIndex
CREATE INDEX "DistributorReport_createdAt_idx" ON "DistributorReport"("createdAt");

-- CreateIndex
CREATE INDEX "DistributorReport_adminReadAt_idx" ON "DistributorReport"("adminReadAt");

-- AddForeignKey
ALTER TABLE "DistributorReport" ADD CONSTRAINT "DistributorReport_reportedDashboardUserId_fkey" FOREIGN KEY ("reportedDashboardUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributorReport" ADD CONSTRAINT "DistributorReport_reporterMarketplaceUserId_fkey" FOREIGN KEY ("reporterMarketplaceUserId") REFERENCES "MarketplaceUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

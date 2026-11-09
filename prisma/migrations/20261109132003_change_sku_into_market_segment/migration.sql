-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "marketSegment" TEXT;

-- CreateIndex
CREATE INDEX "SalesJob_distributorId_clientId_completedAt_idx" ON "SalesJob"("distributorId", "clientId", "completedAt");

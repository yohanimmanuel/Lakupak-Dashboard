-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "receivedAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "OrderCancellation" (
    "id" SERIAL NOT NULL,
    "orderId" TEXT NOT NULL,
    "marketplaceUserId" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "reasonDetail" TEXT,
    "cancelledAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderCancellation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderCancellation_orderId_idx" ON "OrderCancellation"("orderId");

-- CreateIndex
CREATE INDEX "OrderCancellation_marketplaceUserId_idx" ON "OrderCancellation"("marketplaceUserId");

-- AddForeignKey
ALTER TABLE "OrderCancellation" ADD CONSTRAINT "OrderCancellation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("orderId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderCancellation" ADD CONSTRAINT "OrderCancellation_marketplaceUserId_fkey" FOREIGN KEY ("marketplaceUserId") REFERENCES "MarketplaceUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

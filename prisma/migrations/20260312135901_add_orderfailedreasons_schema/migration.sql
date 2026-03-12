-- CreateTable
CREATE TABLE "OrderFailedReason" (
    "id" SERIAL NOT NULL,
    "orderId" TEXT NOT NULL,
    "driverId" INTEGER,
    "reason" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderFailedReason_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderFailedReason_orderId_idx" ON "OrderFailedReason"("orderId");

-- CreateIndex
CREATE INDEX "OrderFailedReason_driverId_idx" ON "OrderFailedReason"("driverId");

-- AddForeignKey
ALTER TABLE "OrderFailedReason" ADD CONSTRAINT "OrderFailedReason_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("orderId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderFailedReason" ADD CONSTRAINT "OrderFailedReason_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

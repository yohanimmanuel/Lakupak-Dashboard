-- CreateTable
CREATE TABLE "OrderReturnRequest" (
    "id" SERIAL NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "reasonDetail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OrderReturnRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderReturnRequest_orderId_idx" ON "OrderReturnRequest"("orderId");

-- CreateIndex
CREATE INDEX "OrderReturnRequest_userId_idx" ON "OrderReturnRequest"("userId");

-- CreateIndex
CREATE INDEX "OrderReturnRequest_status_idx" ON "OrderReturnRequest"("status");

-- AddForeignKey
ALTER TABLE "OrderReturnRequest" ADD CONSTRAINT "OrderReturnRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("orderId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderReturnRequest" ADD CONSTRAINT "OrderReturnRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

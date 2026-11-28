-- AlterTable
ALTER TABLE "BuyerReturnRecord" ADD COLUMN IF NOT EXISTS "returnRequestItemId" INTEGER;
ALTER TABLE "BuyerReturnRecord" ADD COLUMN IF NOT EXISTS "stockDecision" TEXT;
ALTER TABLE "BuyerReturnRecord" ADD COLUMN IF NOT EXISTS "stockDecidedAt" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BuyerReturnRecord_returnRequestItemId_idx" ON "BuyerReturnRecord"("returnRequestItemId");

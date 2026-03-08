-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "returnReason" TEXT,
ADD COLUMN     "returnReasonDetail" TEXT,
ADD COLUMN     "returnedAt" TIMESTAMPTZ(3);

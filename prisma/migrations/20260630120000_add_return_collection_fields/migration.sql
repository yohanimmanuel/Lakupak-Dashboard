-- AlterTable
ALTER TABLE "Order" ADD COLUMN "returnCollectedAt" TIMESTAMPTZ(3),
ADD COLUMN "returnItemsReceivedAt" TIMESTAMPTZ(3),
ADD COLUMN "returnPod" TEXT;

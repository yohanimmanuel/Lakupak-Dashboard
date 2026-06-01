-- AlterTable
ALTER TABLE "Order" ADD COLUMN "paymentProofUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Order" ADD COLUMN "paymentProofSubmittedAt" TIMESTAMPTZ(3);

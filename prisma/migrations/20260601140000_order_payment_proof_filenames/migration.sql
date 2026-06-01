-- AlterTable
ALTER TABLE "Order" ADD COLUMN "paymentProofFileNames" TEXT[] DEFAULT ARRAY[]::TEXT[];

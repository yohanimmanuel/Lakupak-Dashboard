-- AlterTable
ALTER TABLE "OrderReturnRequest" ADD COLUMN     "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];

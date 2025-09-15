-- AlterTable
ALTER TABLE "public"."OrderItem" ADD COLUMN     "packageQuantity" INTEGER DEFAULT 1,
ADD COLUMN     "packageType" TEXT,
ADD COLUMN     "piecesPerPackage" INTEGER DEFAULT 1,
ADD COLUMN     "pricePerPackage" DOUBLE PRECISION;

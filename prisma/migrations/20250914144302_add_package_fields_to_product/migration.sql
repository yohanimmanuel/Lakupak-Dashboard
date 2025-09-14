-- AlterTable
ALTER TABLE "public"."Product" ADD COLUMN     "packageType" TEXT,
ADD COLUMN     "piecesPerPackage" INTEGER DEFAULT 1;

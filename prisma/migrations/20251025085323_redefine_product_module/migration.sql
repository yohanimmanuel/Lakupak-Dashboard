/*
  Warnings:

  - You are about to drop the column `lowStockThreshold` on the `ProductVariant` table. All the data in the column will be lost.
  - You are about to drop the column `packageType` on the `ProductVariant` table. All the data in the column will be lost.
  - You are about to drop the column `piecesPerPackage` on the `ProductVariant` table. All the data in the column will be lost.
  - You are about to drop the column `stockQuantity` on the `ProductVariant` table. All the data in the column will be lost.
  - You are about to drop the column `stockStatus` on the `ProductVariant` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Product" ADD COLUMN     "lowStockThreshold" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stockQuantity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stockStatus" TEXT NOT NULL DEFAULT 'In Stock';

-- AlterTable
ALTER TABLE "public"."ProductVariant" DROP COLUMN "lowStockThreshold",
DROP COLUMN "packageType",
DROP COLUMN "piecesPerPackage",
DROP COLUMN "stockQuantity",
DROP COLUMN "stockStatus",
ADD COLUMN     "attributes" JSONB,
ADD COLUMN     "sku" TEXT,
ADD COLUMN     "variantType" TEXT;

-- CreateTable
CREATE TABLE "public"."PackageInfo" (
    "id" SERIAL NOT NULL,
    "packageType" TEXT NOT NULL,
    "piecesPerPackage" INTEGER NOT NULL DEFAULT 1,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "productId" INTEGER NOT NULL,

    CONSTRAINT "PackageInfo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PackageInfo_productId_idx" ON "public"."PackageInfo"("productId");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_idx" ON "public"."ProductVariant"("productId");

-- CreateIndex
CREATE INDEX "ProductVariant_isActive_idx" ON "public"."ProductVariant"("isActive");

-- AddForeignKey
ALTER TABLE "public"."PackageInfo" ADD CONSTRAINT "PackageInfo_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

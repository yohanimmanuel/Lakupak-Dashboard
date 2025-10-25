/*
  Warnings:

  - You are about to drop the column `lowStockThreshold` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `stockQuantity` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `stockStatus` on the `Product` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."OrderItem" ADD COLUMN     "variantNameSnapshot" TEXT;

-- AlterTable
ALTER TABLE "public"."Product" DROP COLUMN "lowStockThreshold",
DROP COLUMN "stockQuantity",
DROP COLUMN "stockStatus";

-- AlterTable
ALTER TABLE "public"."ProductVariant" ADD COLUMN     "lowStockThreshold" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stockQuantity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stockStatus" TEXT NOT NULL DEFAULT 'In Stock';

/*
  Warnings:

  - You are about to drop the column `attributes` on the `ProductVariant` table. All the data in the column will be lost.
  - You are about to drop the column `isActive` on the `ProductVariant` table. All the data in the column will be lost.
  - You are about to drop the column `isDefault` on the `ProductVariant` table. All the data in the column will be lost.
  - You are about to drop the column `lowStockThreshold` on the `ProductVariant` table. All the data in the column will be lost.
  - You are about to drop the column `moq` on the `ProductVariant` table. All the data in the column will be lost.
  - You are about to drop the column `originalSellingPrice` on the `ProductVariant` table. All the data in the column will be lost.
  - You are about to drop the column `purchasePrice` on the `ProductVariant` table. All the data in the column will be lost.
  - You are about to drop the column `sellingPrice` on the `ProductVariant` table. All the data in the column will be lost.
  - You are about to drop the column `sku` on the `ProductVariant` table. All the data in the column will be lost.
  - You are about to drop the column `stockQuantity` on the `ProductVariant` table. All the data in the column will be lost.
  - You are about to drop the column `stockStatus` on the `ProductVariant` table. All the data in the column will be lost.
  - You are about to drop the column `variantName` on the `ProductVariant` table. All the data in the column will be lost.
  - You are about to drop the `VariantDefinition` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[productId,variantType]` on the table `ProductVariant` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `options` to the `ProductVariant` table without a default value. This is not possible if the table is not empty.
  - Added the required column `position` to the `ProductVariant` table without a default value. This is not possible if the table is not empty.
  - Made the column `variantType` on table `ProductVariant` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "public"."VariantDefinition" DROP CONSTRAINT "VariantDefinition_productId_fkey";

-- DropIndex
DROP INDEX "public"."ProductVariant_isActive_idx";

-- DropIndex
DROP INDEX "public"."ProductVariant_productId_idx";

-- AlterTable
ALTER TABLE "public"."ProductVariant" DROP COLUMN "attributes",
DROP COLUMN "isActive",
DROP COLUMN "isDefault",
DROP COLUMN "lowStockThreshold",
DROP COLUMN "moq",
DROP COLUMN "originalSellingPrice",
DROP COLUMN "purchasePrice",
DROP COLUMN "sellingPrice",
DROP COLUMN "sku",
DROP COLUMN "stockQuantity",
DROP COLUMN "stockStatus",
DROP COLUMN "variantName",
ADD COLUMN     "options" JSONB NOT NULL,
ADD COLUMN     "position" INTEGER NOT NULL,
ALTER COLUMN "variantType" SET NOT NULL;

-- DropTable
DROP TABLE "public"."VariantDefinition";

-- CreateIndex
CREATE INDEX "ProductVariant_productId_position_idx" ON "public"."ProductVariant"("productId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_productId_variantType_key" ON "public"."ProductVariant"("productId", "variantType");

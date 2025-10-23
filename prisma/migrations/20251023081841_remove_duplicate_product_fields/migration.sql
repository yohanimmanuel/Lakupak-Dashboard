/*
  Warnings:

  - You are about to drop the column `lowStockThreshold` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `packageType` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `piecesPerPackage` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `purchasePrice` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `sellingPrice` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `stockQuantity` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `stockStatus` on the `Product` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Product" DROP COLUMN "lowStockThreshold",
DROP COLUMN "packageType",
DROP COLUMN "piecesPerPackage",
DROP COLUMN "purchasePrice",
DROP COLUMN "sellingPrice",
DROP COLUMN "stockQuantity",
DROP COLUMN "stockStatus";

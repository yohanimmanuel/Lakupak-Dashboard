/*
  Warnings:

  - You are about to drop the column `productCategory` on the `Product` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Product_productCategory_idx";

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "productCategory";

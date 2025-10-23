/*
  Warnings:

  - You are about to drop the column `originalSellingPrice` on the `Product` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Product" DROP COLUMN "originalSellingPrice";

-- AlterTable
ALTER TABLE "public"."ProductVariant" ADD COLUMN     "originalSellingPrice" TEXT;

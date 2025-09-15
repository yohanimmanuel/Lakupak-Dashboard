/*
  Warnings:

  - You are about to drop the column `discount` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `discountType` on the `Product` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Product" DROP COLUMN "discount",
DROP COLUMN "discountType";

/*
  Warnings:

  - The `minOrderValue` column on the `OfferDiscountType` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "public"."OfferDiscountType" DROP COLUMN "minOrderValue",
ADD COLUMN     "minOrderValue" DOUBLE PRECISION;

/*
  Warnings:

  - You are about to drop the column `buyerId` on the `OfferUsageTracking` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "public"."OfferUsageTracking_buyerId_idx";

-- DropIndex
DROP INDEX "public"."OfferUsageTracking_offerId_discountTypeId_buyerId_key";

-- AlterTable
ALTER TABLE "public"."OfferUsageTracking" DROP COLUMN "buyerId";

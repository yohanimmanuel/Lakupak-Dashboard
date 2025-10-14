/*
  Warnings:

  - A unique constraint covering the columns `[offerId,discountTypeId,buyerId]` on the table `OfferUsageTracking` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[offerId,discountTypeId,marketplaceUserId]` on the table `OfferUsageTracking` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."OfferUsageTracking_offerId_buyerId_key";

-- DropIndex
DROP INDEX "public"."OfferUsageTracking_offerId_marketplaceUserId_key";

-- AlterTable
ALTER TABLE "public"."OfferUsageTracking" ADD COLUMN     "discountTypeId" TEXT;

-- CreateIndex
CREATE INDEX "OfferUsageTracking_discountTypeId_idx" ON "public"."OfferUsageTracking"("discountTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "OfferUsageTracking_offerId_discountTypeId_buyerId_key" ON "public"."OfferUsageTracking"("offerId", "discountTypeId", "buyerId");

-- CreateIndex
CREATE UNIQUE INDEX "OfferUsageTracking_offerId_discountTypeId_marketplaceUserId_key" ON "public"."OfferUsageTracking"("offerId", "discountTypeId", "marketplaceUserId");

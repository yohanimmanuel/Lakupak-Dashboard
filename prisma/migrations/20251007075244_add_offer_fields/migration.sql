/*
  Warnings:

  - You are about to drop the column `discountType` on the `Offer` table. All the data in the column will be lost.
  - You are about to drop the column `discountValue` on the `Offer` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Offer" DROP COLUMN "discountType",
DROP COLUMN "discountValue";

-- CreateTable
CREATE TABLE "public"."OfferDiscountType" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "discountType" TEXT NOT NULL,
    "discountValue" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OfferDiscountType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OfferDiscountType_offerId_idx" ON "public"."OfferDiscountType"("offerId");

-- CreateIndex
CREATE INDEX "OfferDiscountType_discountType_idx" ON "public"."OfferDiscountType"("discountType");

-- CreateIndex
CREATE INDEX "OfferDiscountType_priority_idx" ON "public"."OfferDiscountType"("priority");

-- AddForeignKey
ALTER TABLE "public"."OfferDiscountType" ADD CONSTRAINT "OfferDiscountType_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "public"."Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

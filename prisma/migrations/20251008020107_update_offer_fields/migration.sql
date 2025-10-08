/*
  Warnings:

  - You are about to drop the column `maxUsage` on the `Offer` table. All the data in the column will be lost.
  - You are about to drop the column `minOrderValue` on the `Offer` table. All the data in the column will be lost.
  - You are about to drop the column `minQuantity` on the `Offer` table. All the data in the column will be lost.
  - You are about to drop the column `perCustomerLimit` on the `Offer` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Offer" DROP COLUMN "maxUsage",
DROP COLUMN "minOrderValue",
DROP COLUMN "minQuantity",
DROP COLUMN "perCustomerLimit";

-- AlterTable
ALTER TABLE "public"."OfferDiscountType" ADD COLUMN     "description" TEXT,
ADD COLUMN     "maxUsage" INTEGER,
ADD COLUMN     "minOrderValue" DOUBLE PRECISION,
ADD COLUMN     "minQuantity" INTEGER,
ADD COLUMN     "name" TEXT,
ADD COLUMN     "perCustomerLimit" INTEGER;

-- CreateTable
CREATE TABLE "public"."DateRange" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DateRange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TimeSlot" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TimeSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DateRange_offerId_idx" ON "public"."DateRange"("offerId");

-- CreateIndex
CREATE INDEX "DateRange_startDate_endDate_idx" ON "public"."DateRange"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "TimeSlot_offerId_idx" ON "public"."TimeSlot"("offerId");

-- AddForeignKey
ALTER TABLE "public"."DateRange" ADD CONSTRAINT "DateRange_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "public"."Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TimeSlot" ADD CONSTRAINT "TimeSlot_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "public"."Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

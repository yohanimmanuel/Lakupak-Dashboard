/*
  Warnings:

  - Added the required column `updatedAt` to the `OrderDeliveryReview` table without a default value. This is not possible if the table is not empty.

*/
-- Add column as nullable, backfill from createdAt, then set NOT NULL (safe for existing rows)
ALTER TABLE "OrderDeliveryReview" ADD COLUMN "updatedAt" TIMESTAMPTZ(3);
UPDATE "OrderDeliveryReview" SET "updatedAt" = "createdAt";
ALTER TABLE "OrderDeliveryReview" ALTER COLUMN "updatedAt" SET NOT NULL;

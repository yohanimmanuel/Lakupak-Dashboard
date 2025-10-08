/*
  Warnings:

  - The `type` column on the `Offer` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "public"."Offer" DROP COLUMN "type",
ADD COLUMN     "type" TEXT[];

-- CreateIndex
CREATE INDEX "Offer_type_idx" ON "public"."Offer"("type");

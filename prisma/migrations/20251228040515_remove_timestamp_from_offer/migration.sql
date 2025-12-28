/*
  Warnings:

  - You are about to drop the column `endDate` on the `Offer` table. All the data in the column will be lost.
  - You are about to drop the column `startDate` on the `Offer` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Offer_startDate_endDate_idx";

-- AlterTable
ALTER TABLE "Offer" DROP COLUMN "endDate",
DROP COLUMN "startDate";

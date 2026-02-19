/*
  Warnings:

  - Made the column `eta` on table `Fleet` required. This step will fail if there are existing NULL values in that column.
  - Made the column `lastUpdate` on table `Fleet` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Fleet" ALTER COLUMN "eta" SET NOT NULL,
ALTER COLUMN "eta" SET DATA TYPE TEXT,
ALTER COLUMN "lastUpdate" SET NOT NULL,
ALTER COLUMN "lastUpdate" SET DATA TYPE TEXT;

/*
  Warnings:

  - The `eta` column on the `Fleet` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `lastUpdate` column on the `Fleet` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "Fleet" DROP COLUMN "eta",
ADD COLUMN     "eta" TIMESTAMPTZ(3),
DROP COLUMN "lastUpdate",
ADD COLUMN     "lastUpdate" TIMESTAMPTZ(3);

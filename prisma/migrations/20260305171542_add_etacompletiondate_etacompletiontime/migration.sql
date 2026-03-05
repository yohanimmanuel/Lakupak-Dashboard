/*
  Warnings:

  - You are about to drop the column `eta` on the `Fleet` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Fleet" DROP COLUMN "eta",
ADD COLUMN     "etaCompletionDate" TIMESTAMPTZ(3),
ADD COLUMN     "etaCompletionTime" TEXT;

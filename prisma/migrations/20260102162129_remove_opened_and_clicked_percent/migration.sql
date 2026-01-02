/*
  Warnings:

  - You are about to drop the column `clickedPercent` on the `Campaign` table. All the data in the column will be lost.
  - You are about to drop the column `openedPercent` on the `Campaign` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Campaign" DROP COLUMN "clickedPercent",
DROP COLUMN "openedPercent";

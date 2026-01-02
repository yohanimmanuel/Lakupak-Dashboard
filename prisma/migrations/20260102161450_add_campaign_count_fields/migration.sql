-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "clicksCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "opensCount" INTEGER NOT NULL DEFAULT 0;

-- Copy data from openedPercent to opensCount and clickedPercent to clicksCount
UPDATE "Campaign" SET "opensCount" = CAST("openedPercent" AS INTEGER) WHERE "openedPercent" IS NOT NULL;
UPDATE "Campaign" SET "clicksCount" = CAST("clickedPercent" AS INTEGER) WHERE "clickedPercent" IS NOT NULL;

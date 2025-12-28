-- AlterTable
ALTER TABLE "DateRange" ADD COLUMN     "deletedAt" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "DateRange_deletedAt_idx" ON "DateRange"("deletedAt");

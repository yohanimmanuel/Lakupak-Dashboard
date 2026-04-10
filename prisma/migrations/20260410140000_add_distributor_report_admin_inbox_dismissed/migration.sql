-- Dismiss-from-bell only: keeps rows for distributor user-detail "Buyer reports".
ALTER TABLE "DistributorReport" ADD COLUMN "adminInboxDismissedAt" TIMESTAMPTZ(3);
CREATE INDEX "DistributorReport_adminInboxDismissedAt_idx" ON "DistributorReport"("adminInboxDismissedAt");

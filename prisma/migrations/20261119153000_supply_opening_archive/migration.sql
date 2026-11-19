ALTER TABLE "SupplyRecord" ADD COLUMN "archivedAt" TIMESTAMPTZ(3);
CREATE INDEX "SupplyRecord_supplierRefId_archivedAt_idx" ON "SupplyRecord"("supplierRefId", "archivedAt");

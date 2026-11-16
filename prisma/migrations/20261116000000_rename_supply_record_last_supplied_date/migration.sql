-- Preserve all existing supplied dates while renaming the SupplyRecord column.
ALTER TABLE "SupplyRecord" RENAME COLUMN "lastDelivery" TO "lastSuppliedDate";

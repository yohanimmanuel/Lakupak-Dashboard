ALTER TABLE "SupplyRecord"
  ADD COLUMN "receivedQuantity" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "receivedUnit" TEXT NOT NULL DEFAULT 'Pieces';

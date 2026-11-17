-- Backfill historical receipts whose receivedQuantity was left at the DB default.
-- totalSupplied is the canonical inventory amount in Pieces. The original carton/box
-- input cannot be reconstructed when it was never stored, so normalize these rows
-- to an equivalent Pieces entry rather than mislabelling piece totals as packages.
UPDATE "SupplyRecord"
SET
  "receivedQuantity" = BTRIM("totalSupplied"),
  "receivedUnit" = 'Pieces'
WHERE
  "recordType" = 'history'
  AND BTRIM(COALESCE("receivedQuantity", '')) = ''
  AND BTRIM(COALESCE("totalSupplied", '')) <> '';

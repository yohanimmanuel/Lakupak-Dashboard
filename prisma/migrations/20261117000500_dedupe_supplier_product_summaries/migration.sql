-- Keep exactly one supplier summary per catalog product + SKU.
-- Rows from the same catalog product but different SKUs remain separate variants.
-- Unlinked legacy rows are only merged when both SKU and display product match.
CREATE TEMP TABLE "_SupplySummaryDedupe" AS
SELECT
  "supplierRefId",
  identity_key,
  MIN(id) AS keeper_id,
  SUM(
    CASE
      WHEN qty_text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN qty_text::numeric
      ELSE 0
    END
  )::text AS total_supplied,
  SUM(
    CASE
      WHEN value_text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN value_text::numeric
      ELSE 0
    END
  )::text AS total_value,
  MAX(NULLIF("lastSuppliedDate", '')) AS last_supplied_date,
  ARRAY_AGG(id ORDER BY id) AS row_ids
FROM (
  SELECT
    id,
    "supplierRefId",
    "lastSuppliedDate",
    CASE
      WHEN NULLIF(BTRIM("productId"), '') IS NOT NULL
        AND NULLIF(BTRIM(sku), '') IS NOT NULL
        THEN 'id:' || LOWER(BTRIM("productId")) || '|sku:' || LOWER(BTRIM(sku))
      WHEN NULLIF(BTRIM("productId"), '') IS NOT NULL
        THEN 'id:' || LOWER(BTRIM("productId")) || '|variant:' || LOWER(COALESCE(NULLIF(BTRIM("variantName"), ''), NULLIF(BTRIM(product), ''), ''))
      WHEN NULLIF(BTRIM(sku), '') IS NOT NULL
        THEN 'sku:' || LOWER(BTRIM(sku)) || '|product:' || LOWER(BTRIM(product))
      ELSE 'product:' || LOWER(BTRIM(product))
    END AS identity_key,
    REGEXP_REPLACE(COALESCE("totalSupplied", ''), '[^0-9.-]', '', 'g') AS qty_text,
    REGEXP_REPLACE(COALESCE("totalValue", ''), '[^0-9.-]', '', 'g') AS value_text
  FROM "SupplyRecord"
  WHERE LOWER(COALESCE("recordType", '')) = 'summary'
     OR "suppliesno" LIKE 'AUTO-%'
) AS source_rows
GROUP BY "supplierRefId", identity_key
HAVING COUNT(*) > 1;

-- Aggregate duplicate balances into the oldest stable row (normally the AUTO row).
UPDATE "SupplyRecord" AS keeper
SET
  "totalSupplied" = merged.total_supplied,
  "totalValue" = merged.total_value,
  "lastSuppliedDate" = COALESCE(merged.last_supplied_date, keeper."lastSuppliedDate"),
  "recordType" = 'summary'
FROM "_SupplySummaryDedupe" AS merged
WHERE keeper.id = merged.keeper_id;

-- Remove the extra summary rows after the keeper has the combined totals.
DELETE FROM "SupplyRecord" AS duplicate
USING "_SupplySummaryDedupe" AS merged
WHERE duplicate."supplierRefId" = merged."supplierRefId"
  AND duplicate.id = ANY(merged.row_ids)
  AND duplicate.id <> merged.keeper_id;

DROP TABLE "_SupplySummaryDedupe";

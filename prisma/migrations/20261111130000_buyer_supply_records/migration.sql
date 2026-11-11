-- CreateTable
CREATE TABLE "BuyerRecord" (
    "id" SERIAL NOT NULL,
    "buyerRefId" INTEGER NOT NULL,
    "orderNo" TEXT NOT NULL DEFAULT '',
    "product" TEXT NOT NULL DEFAULT '',
    "totalOrders" TEXT NOT NULL DEFAULT '',
    "totalSpend" TEXT NOT NULL DEFAULT '',
    "shippingFee" TEXT,
    "lastOrderDate" TEXT NOT NULL DEFAULT '',
    "outstanding" TEXT NOT NULL DEFAULT '',
    "freeItems" INTEGER,
    "discountBadge" TEXT,
    "offerApplied" BOOLEAN,
    "syncedFromOrders" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BuyerRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyRecord" (
    "id" SERIAL NOT NULL,
    "supplierRefId" INTEGER NOT NULL,
    "suppliesno" TEXT NOT NULL DEFAULT '',
    "sku" TEXT NOT NULL DEFAULT '',
    "product" TEXT NOT NULL DEFAULT '',
    "totalSupplied" TEXT NOT NULL DEFAULT '',
    "totalValue" TEXT NOT NULL DEFAULT '',
    "lastDelivery" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'Active',
    "deliverySuccess" TEXT,
    "recordType" TEXT NOT NULL DEFAULT 'history',
    "productId" TEXT,
    "variantName" TEXT,
    "updateCurrentStock" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SupplyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BuyerRecord_buyerRefId_idx" ON "BuyerRecord"("buyerRefId");

-- CreateIndex
CREATE INDEX "BuyerRecord_buyerRefId_sortOrder_idx" ON "BuyerRecord"("buyerRefId", "sortOrder");

-- CreateIndex
CREATE INDEX "SupplyRecord_supplierRefId_idx" ON "SupplyRecord"("supplierRefId");

-- CreateIndex
CREATE INDEX "SupplyRecord_supplierRefId_recordType_idx" ON "SupplyRecord"("supplierRefId", "recordType");

-- CreateIndex
CREATE INDEX "SupplyRecord_supplierRefId_sortOrder_idx" ON "SupplyRecord"("supplierRefId", "sortOrder");

-- CreateIndex
CREATE INDEX "SupplyRecord_productId_idx" ON "SupplyRecord"("productId");

-- CreateIndex
CREATE INDEX "SupplyRecord_sku_idx" ON "SupplyRecord"("sku");

-- AddForeignKey
ALTER TABLE "BuyerRecord" ADD CONSTRAINT "BuyerRecord_buyerRefId_fkey" FOREIGN KEY ("buyerRefId") REFERENCES "Buyer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyRecord" ADD CONSTRAINT "SupplyRecord_supplierRefId_fkey" FOREIGN KEY ("supplierRefId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- Data-preserving backfill: Buyer.orderDetails JSON -> BuyerRecord
-- ============================================================================
INSERT INTO "BuyerRecord" (
  "buyerRefId",
  "orderNo",
  "product",
  "totalOrders",
  "totalSpend",
  "shippingFee",
  "lastOrderDate",
  "outstanding",
  "freeItems",
  "discountBadge",
  "offerApplied",
  "syncedFromOrders",
  "sortOrder",
  "createdAt",
  "updatedAt"
)
SELECT
  b."id",
  COALESCE(elem->>'orderNo', ''),
  COALESCE(elem->>'product', ''),
  COALESCE(elem->>'totalOrders', ''),
  COALESCE(elem->>'totalSpend', ''),
  NULLIF(elem->>'shippingFee', ''),
  COALESCE(elem->>'lastOrderDate', ''),
  COALESCE(elem->>'outstanding', ''),
  CASE
    WHEN elem->>'freeItems' ~ '^-?\d+$' THEN (elem->>'freeItems')::INTEGER
    ELSE NULL
  END,
  NULLIF(elem->>'discountBadge', ''),
  CASE
    WHEN lower(COALESCE(elem->>'offerApplied', '')) IN ('true', '1', 'yes') THEN TRUE
    WHEN lower(COALESCE(elem->>'offerApplied', '')) IN ('false', '0', 'no') THEN FALSE
    ELSE NULL
  END,
  CASE
    WHEN lower(COALESCE(elem->>'syncedFromOrders', '')) IN ('true', '1', 'yes') THEN TRUE
    ELSE FALSE
  END,
  (ord - 1),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Buyer" b
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN b."orderDetails" IS NULL OR btrim(b."orderDetails") = '' THEN '[]'::jsonb
    WHEN left(btrim(b."orderDetails"), 1) = '[' THEN b."orderDetails"::jsonb
    ELSE '[]'::jsonb
  END
) WITH ORDINALITY AS arr(elem, ord)
WHERE b."orderDetails" IS NOT NULL
  AND btrim(b."orderDetails") <> ''
  AND btrim(b."orderDetails") <> '[]'
  AND left(btrim(b."orderDetails"), 1) = '[';

-- ============================================================================
-- Data-preserving backfill: Supplier.supplies JSON -> SupplyRecord
-- ============================================================================
INSERT INTO "SupplyRecord" (
  "supplierRefId",
  "suppliesno",
  "sku",
  "product",
  "totalSupplied",
  "totalValue",
  "lastDelivery",
  "status",
  "deliverySuccess",
  "recordType",
  "productId",
  "variantName",
  "updateCurrentStock",
  "sortOrder",
  "createdAt",
  "updatedAt"
)
SELECT
  s."id",
  COALESCE(elem->>'suppliesno', ''),
  COALESCE(elem->>'sku', ''),
  COALESCE(elem->>'product', ''),
  COALESCE(elem->>'totalSupplied', ''),
  COALESCE(elem->>'totalValue', ''),
  COALESCE(elem->>'lastDelivery', ''),
  COALESCE(NULLIF(elem->>'status', ''), 'Active'),
  NULLIF(elem->>'deliverySuccess', ''),
  CASE
    WHEN elem->>'recordType' IN ('history', 'summary') THEN elem->>'recordType'
    WHEN left(COALESCE(elem->>'suppliesno', ''), 5) = 'AUTO-' THEN 'summary'
    ELSE 'history'
  END,
  NULLIF(elem->>'productId', ''),
  NULLIF(elem->>'variantName', ''),
  CASE
    WHEN lower(COALESCE(elem->>'updateCurrentStock', '')) IN ('true', '1', 'yes') THEN TRUE
    ELSE FALSE
  END,
  (ord - 1),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Supplier" s
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN s."supplies" IS NULL OR btrim(s."supplies") = '' THEN '[]'::jsonb
    WHEN left(btrim(s."supplies"), 1) = '[' THEN s."supplies"::jsonb
    ELSE '[]'::jsonb
  END
) WITH ORDINALITY AS arr(elem, ord)
WHERE s."supplies" IS NOT NULL
  AND btrim(s."supplies") <> ''
  AND btrim(s."supplies") <> '[]'
  AND left(btrim(s."supplies"), 1) = '[';

-- Defense-in-depth RLS (API still enforces auth; service role bypasses).
ALTER TABLE "BuyerRecord" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow buyer record operations" ON "BuyerRecord" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE "SupplyRecord" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow supply record operations" ON "SupplyRecord" FOR ALL USING (true) WITH CHECK (true);

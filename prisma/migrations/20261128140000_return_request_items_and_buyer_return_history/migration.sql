-- Return request line items + CRM return history + credit amounts.
-- Idempotent: safe when objects already exist from a prior db push.

-- Order / return request credit totals (display / nota nett; does not rewrite OrderItem lines)
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "returnCreditAmount" DECIMAL(12,2);

ALTER TABLE "OrderReturnRequest"
  ADD COLUMN IF NOT EXISTS "creditAmount" DECIMAL(12,2);

-- Line items on a return request
CREATE TABLE IF NOT EXISTS "OrderReturnRequestItem" (
  "id" SERIAL NOT NULL,
  "returnRequestId" INTEGER NOT NULL,
  "orderItemId" INTEGER,
  "productId" TEXT,
  "productNameSnapshot" TEXT NOT NULL,
  "variantNameSnapshot" TEXT,
  "productSkuSnapshot" TEXT,
  "packageType" TEXT,
  "piecesPerPackage" INTEGER NOT NULL DEFAULT 1,
  "quantityReturned" INTEGER NOT NULL,
  "unitPriceSnapshot" DECIMAL(12,2) NOT NULL,
  "lineCreditAmount" DECIMAL(12,2) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "OrderReturnRequestItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OrderReturnRequestItem_returnRequestId_idx"
  ON "OrderReturnRequestItem"("returnRequestId");
CREATE INDEX IF NOT EXISTS "OrderReturnRequestItem_orderItemId_idx"
  ON "OrderReturnRequestItem"("orderItemId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OrderReturnRequestItem_returnRequestId_fkey'
  ) THEN
    ALTER TABLE "OrderReturnRequestItem"
      ADD CONSTRAINT "OrderReturnRequestItem_returnRequestId_fkey"
      FOREIGN KEY ("returnRequestId") REFERENCES "OrderReturnRequest"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Accepted + completed return lines for distributor CRM
CREATE TABLE IF NOT EXISTS "BuyerReturnRecord" (
  "id" SERIAL NOT NULL,
  "buyerRefId" INTEGER NOT NULL,
  "orderNo" TEXT NOT NULL DEFAULT '',
  "returnRequestId" INTEGER,
  "product" TEXT NOT NULL DEFAULT '',
  "productId" TEXT,
  "skuSnapshot" TEXT,
  "variantName" TEXT,
  "stockType" TEXT,
  "piecesPerPackage" INTEGER,
  "quantityReturned" INTEGER NOT NULL DEFAULT 0,
  "lineCreditAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "reason" TEXT,
  "returnedAt" TIMESTAMPTZ(3),
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "BuyerReturnRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BuyerReturnRecord_buyerRefId_idx"
  ON "BuyerReturnRecord"("buyerRefId");
CREATE INDEX IF NOT EXISTS "BuyerReturnRecord_buyerRefId_sortOrder_idx"
  ON "BuyerReturnRecord"("buyerRefId", "sortOrder");
CREATE INDEX IF NOT EXISTS "BuyerReturnRecord_returnRequestId_idx"
  ON "BuyerReturnRecord"("returnRequestId");
CREATE INDEX IF NOT EXISTS "BuyerReturnRecord_orderNo_idx"
  ON "BuyerReturnRecord"("orderNo");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'BuyerReturnRecord_buyerRefId_fkey'
  ) THEN
    ALTER TABLE "BuyerReturnRecord"
      ADD CONSTRAINT "BuyerReturnRecord_buyerRefId_fkey"
      FOREIGN KEY ("buyerRefId") REFERENCES "Buyer"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Schema no longer indexes BuyerRecord.variantOptionId (FK remains)
DROP INDEX IF EXISTS "BuyerRecord_variantOptionId_idx";

-- Align MarketSegmentDirectory unique index name with Prisma's truncated identifier
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'i'
      AND c.relname = 'MarketSegmentDirectory_userId_mainChannel_subChannel_outletExam'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'i'
      AND c.relname = 'MarketSegmentDirectory_userId_mainChannel_subChannel_outlet_key'
  ) THEN
    ALTER INDEX "MarketSegmentDirectory_userId_mainChannel_subChannel_outletExam"
      RENAME TO "MarketSegmentDirectory_userId_mainChannel_subChannel_outlet_key";
  END IF;
END $$;

-- @updatedAt has no DB default (Prisma sets it in the client)
ALTER TABLE "MarketSegmentDirectory"
  ALTER COLUMN "updatedAt" DROP DEFAULT;

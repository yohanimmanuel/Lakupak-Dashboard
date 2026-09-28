-- Distributor account number, kept apart from the marketplace buyer id.
ALTER TABLE "Buyer" ADD COLUMN IF NOT EXISTS "customerNumber" TEXT;

-- Auto matching stays off until a distributor turns it on.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "autoClientMatch" BOOLEAN NOT NULL DEFAULT false;

-- Prospects created before this column stored the account number in buyerId.
UPDATE "Buyer"
SET "customerNumber" = "buyerId"
WHERE "customerNumber" IS NULL
  AND "status" = 'Prospect'
  AND "buyerId" NOT LIKE 'LKB-%'
  AND "buyerId" NOT LIKE 'LKP-%'
  AND "buyerId" NOT LIKE 'mobile_user_%';

CREATE UNIQUE INDEX IF NOT EXISTS "Buyer_userId_customerNumber_key" ON "Buyer"("userId", "customerNumber");

-- One-time invite tokens: marketplace account claims an existing CRM buyer + market segment.
CREATE TABLE "BuyerMarketplaceInvite" (
    "id" SERIAL NOT NULL,
    "distributorId" INTEGER NOT NULL,
    "buyerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "claimedMarketplaceUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuyerMarketplaceInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BuyerMarketplaceInvite_tokenHash_key" ON "BuyerMarketplaceInvite"("tokenHash");
CREATE INDEX "BuyerMarketplaceInvite_distributorId_buyerId_idx" ON "BuyerMarketplaceInvite"("distributorId", "buyerId");
CREATE INDEX "BuyerMarketplaceInvite_expiresAt_idx" ON "BuyerMarketplaceInvite"("expiresAt");

ALTER TABLE "BuyerMarketplaceInvite" ADD CONSTRAINT "BuyerMarketplaceInvite_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuyerMarketplaceInvite" ADD CONSTRAINT "BuyerMarketplaceInvite_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Buyer"("buyerId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BuyerMarketplaceInvite" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow buyer marketplace invite operations" ON "BuyerMarketplaceInvite";
CREATE POLICY "Allow buyer marketplace invite operations" ON "BuyerMarketplaceInvite" FOR ALL USING (true) WITH CHECK (true);

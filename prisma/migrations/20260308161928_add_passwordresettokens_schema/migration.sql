-- CreateTable
CREATE TABLE "MarketplacePasswordResetToken" (
    "id" SERIAL NOT NULL,
    "marketplaceUserId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplacePasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketplacePasswordResetToken_marketplaceUserId_idx" ON "MarketplacePasswordResetToken"("marketplaceUserId");

-- CreateIndex
CREATE INDEX "MarketplacePasswordResetToken_expiresAt_idx" ON "MarketplacePasswordResetToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "MarketplacePasswordResetToken" ADD CONSTRAINT "MarketplacePasswordResetToken_marketplaceUserId_fkey" FOREIGN KEY ("marketplaceUserId") REFERENCES "MarketplaceUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

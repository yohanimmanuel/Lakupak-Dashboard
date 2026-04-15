-- CreateEnum
CREATE TYPE "MarketplaceSearchTermMapKind" AS ENUM ('SYNONYM', 'TRANSLATION');

-- CreateTable
CREATE TABLE "MarketplaceSearchTermMap" (
    "id" TEXT NOT NULL,
    "kind" "MarketplaceSearchTermMapKind" NOT NULL,
    "fromTerm" TEXT NOT NULL,
    "toTerm" TEXT NOT NULL,
    "fromLocale" TEXT,
    "toLocale" TEXT,
    "bidirectional" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdByAdminId" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MarketplaceSearchTermMap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketplaceSearchTermMap_kind_enabled_idx" ON "MarketplaceSearchTermMap"("kind", "enabled");

-- CreateIndex
CREATE INDEX "MarketplaceSearchTermMap_fromTerm_idx" ON "MarketplaceSearchTermMap"("fromTerm");

-- CreateIndex
CREATE INDEX "MarketplaceSearchTermMap_toTerm_idx" ON "MarketplaceSearchTermMap"("toTerm");

-- CreateIndex
CREATE INDEX "MarketplaceSearchTermMap_fromLocale_toLocale_idx" ON "MarketplaceSearchTermMap"("fromLocale", "toLocale");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceSearchTermMap_kind_fromTerm_toTerm_fromLocale_to_key" ON "MarketplaceSearchTermMap"("kind", "fromTerm", "toTerm", "fromLocale", "toLocale");

-- AddForeignKey
ALTER TABLE "MarketplaceSearchTermMap" ADD CONSTRAINT "MarketplaceSearchTermMap_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "PlatformAdmin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

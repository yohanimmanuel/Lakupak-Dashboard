-- CreateTable
CREATE TABLE "public"."UserCart" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "variant" TEXT DEFAULT 'Default',
    "selected" BOOLEAN NOT NULL DEFAULT true,
    "addedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "UserCart_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserCart_userId_idx" ON "public"."UserCart"("userId");

-- CreateIndex
CREATE INDEX "UserCart_productId_idx" ON "public"."UserCart"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "UserCart_userId_productId_variant_key" ON "public"."UserCart"("userId", "productId", "variant");

-- AddForeignKey
ALTER TABLE "public"."UserCart" ADD CONSTRAINT "UserCart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."MarketplaceUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserCart" ADD CONSTRAINT "UserCart_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

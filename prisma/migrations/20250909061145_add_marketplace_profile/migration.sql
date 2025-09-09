-- CreateTable
CREATE TABLE "public"."MarketplaceProfile" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "phone" TEXT NOT NULL,
    "country" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MarketplaceProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceProfile_userId_key" ON "public"."MarketplaceProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceProfile_phone_key" ON "public"."MarketplaceProfile"("phone");

-- AddForeignKey
ALTER TABLE "public"."MarketplaceProfile" ADD CONSTRAINT "MarketplaceProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

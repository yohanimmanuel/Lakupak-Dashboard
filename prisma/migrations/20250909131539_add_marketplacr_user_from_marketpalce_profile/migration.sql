/*
  Warnings:

  - You are about to drop the `MarketplaceProfile` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."MarketplaceProfile" DROP CONSTRAINT "MarketplaceProfile_userId_fkey";

-- DropTable
DROP TABLE "public"."MarketplaceProfile";

-- CreateTable
CREATE TABLE "public"."MarketplaceUser" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "bio" TEXT,
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "country" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MarketplaceUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceUser_username_key" ON "public"."MarketplaceUser"("username");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceUser_email_key" ON "public"."MarketplaceUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceUser_phone_key" ON "public"."MarketplaceUser"("phone");

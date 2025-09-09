/*
  Warnings:

  - You are about to drop the column `address` on the `MarketplaceUser` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."MarketplaceUser" DROP COLUMN "address",
ADD COLUMN     "chosenAddress" TEXT;

-- CreateTable
CREATE TABLE "public"."Address" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."Address" ADD CONSTRAINT "Address_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."MarketplaceUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

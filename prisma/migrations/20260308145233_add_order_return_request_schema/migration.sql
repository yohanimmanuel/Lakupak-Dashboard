/*
  Warnings:

  - You are about to drop the column `userId` on the `OrderReturnRequest` table. All the data in the column will be lost.
  - Added the required column `marketplaceUserId` to the `OrderReturnRequest` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "OrderReturnRequest" DROP CONSTRAINT "OrderReturnRequest_userId_fkey";

-- DropIndex
DROP INDEX "OrderReturnRequest_userId_idx";

-- AlterTable
ALTER TABLE "OrderReturnRequest" DROP COLUMN "userId",
ADD COLUMN     "marketplaceUserId" INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX "OrderReturnRequest_marketplaceUserId_idx" ON "OrderReturnRequest"("marketplaceUserId");

-- AddForeignKey
ALTER TABLE "OrderReturnRequest" ADD CONSTRAINT "OrderReturnRequest_marketplaceUserId_fkey" FOREIGN KEY ("marketplaceUserId") REFERENCES "MarketplaceUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

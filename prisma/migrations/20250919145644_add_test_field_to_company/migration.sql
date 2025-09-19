/*
  Warnings:

  - You are about to drop the column `companyId` on the `MarketplaceUser` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."MarketplaceUser" DROP CONSTRAINT "MarketplaceUser_companyId_fkey";

-- AlterTable
ALTER TABLE "public"."Company" ADD COLUMN     "testField" TEXT;

-- AlterTable
ALTER TABLE "public"."MarketplaceUser" DROP COLUMN "companyId";

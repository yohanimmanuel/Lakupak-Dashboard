/*
  Warnings:

  - You are about to drop the column `currency` on the `Buyer` table. All the data in the column will be lost.
  - You are about to drop the column `currency` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `currency` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `currency` on the `Supplier` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Buyer" DROP COLUMN "currency";

-- AlterTable
ALTER TABLE "public"."Order" DROP COLUMN "currency";

-- AlterTable
ALTER TABLE "public"."Product" DROP COLUMN "currency";

-- AlterTable
ALTER TABLE "public"."Supplier" DROP COLUMN "currency";

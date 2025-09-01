/*
  Warnings:

  - You are about to drop the column `shopEarnings` on the `Order` table. All the data in the column will be lost.
  - You are about to alter the column `totalOrders` on the `Order` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Integer`.

*/
-- AlterTable
ALTER TABLE "public"."Order" DROP COLUMN "shopEarnings",
ALTER COLUMN "totalOrders" SET DATA TYPE INTEGER;

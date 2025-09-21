/*
  Warnings:

  - You are about to drop the `UserCart` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."UserCart" DROP CONSTRAINT "UserCart_productId_fkey";

-- DropForeignKey
ALTER TABLE "public"."UserCart" DROP CONSTRAINT "UserCart_userId_fkey";

-- DropTable
DROP TABLE "public"."UserCart";

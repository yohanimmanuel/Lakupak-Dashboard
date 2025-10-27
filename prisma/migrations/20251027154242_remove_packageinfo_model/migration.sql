/*
  Warnings:

  - You are about to drop the `PackageInfo` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."PackageInfo" DROP CONSTRAINT "PackageInfo_productId_fkey";

-- DropTable
DROP TABLE "public"."PackageInfo";

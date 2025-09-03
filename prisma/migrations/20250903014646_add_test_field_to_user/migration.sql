/*
  Warnings:

  - You are about to drop the column `testColumn` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."User" DROP COLUMN "testColumn",
ADD COLUMN     "testField" TEXT;

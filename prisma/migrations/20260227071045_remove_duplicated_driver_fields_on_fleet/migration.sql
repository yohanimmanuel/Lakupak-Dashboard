/*
  Warnings:

  - You are about to drop the column `driverAvatar` on the `Fleet` table. All the data in the column will be lost.
  - You are about to drop the column `driverExperience` on the `Fleet` table. All the data in the column will be lost.
  - You are about to drop the column `driverName` on the `Fleet` table. All the data in the column will be lost.
  - You are about to drop the column `driverPasswordHash` on the `Fleet` table. All the data in the column will be lost.
  - You are about to drop the column `driverPhone` on the `Fleet` table. All the data in the column will be lost.
  - You are about to drop the column `driverStatus` on the `Fleet` table. All the data in the column will be lost.
  - You are about to drop the column `driverUsername` on the `Fleet` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Fleet_driverUsername_key";

-- AlterTable
ALTER TABLE "Fleet" DROP COLUMN "driverAvatar",
DROP COLUMN "driverExperience",
DROP COLUMN "driverName",
DROP COLUMN "driverPasswordHash",
DROP COLUMN "driverPhone",
DROP COLUMN "driverStatus",
DROP COLUMN "driverUsername";

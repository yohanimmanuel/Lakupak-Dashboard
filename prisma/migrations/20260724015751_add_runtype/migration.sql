/*
  Warnings:

  - Added the required column `runType` to the `AutomationRun` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "AutomationRun" ADD COLUMN     "runType" TEXT NOT NULL;

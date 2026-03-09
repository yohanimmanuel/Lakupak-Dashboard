/*
  Warnings:

  - The `imageUrls` column on the `OrderReturnRequest` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "OrderReturnRequest" DROP COLUMN "imageUrls",
ADD COLUMN     "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];

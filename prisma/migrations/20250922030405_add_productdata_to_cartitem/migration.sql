/*
  Warnings:

  - Added the required column `productData` to the `CartItem` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."CartItem" ADD COLUMN     "productData" JSONB NOT NULL;

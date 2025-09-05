-- DropForeignKey
ALTER TABLE "public"."OrderItem" DROP CONSTRAINT "OrderItem_productId_fkey";

-- DropIndex
DROP INDEX "public"."OrderItem_orderId_productId_key";

-- AlterTable
ALTER TABLE "public"."OrderItem" ADD COLUMN     "productNameSnapshot" TEXT,
ADD COLUMN     "productSkuSnapshot" TEXT,
ALTER COLUMN "productId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("productId") ON DELETE SET NULL ON UPDATE CASCADE;

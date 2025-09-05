-- DropForeignKey
ALTER TABLE "public"."Order" DROP CONSTRAINT "Order_buyerId_fkey";

-- AlterTable
ALTER TABLE "public"."Order" ADD COLUMN     "buyerIdSnapshot" TEXT,
ADD COLUMN     "contactPersonSnapshot" TEXT,
ADD COLUMN     "contactPhoneSnapshot" TEXT,
ADD COLUMN     "customerEmailSnapshot" TEXT,
ADD COLUMN     "deliveryAddressSnapshot" TEXT,
ADD COLUMN     "orderDateSnapshot" TIMESTAMPTZ(3),
ADD COLUMN     "storeNameSnapshot" TEXT,
ALTER COLUMN "buyerId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."OrderItem" ADD COLUMN     "productCategorySnapshot" TEXT;

-- AddForeignKey
ALTER TABLE "public"."Order" ADD CONSTRAINT "Order_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "public"."Buyer"("buyerId") ON DELETE SET NULL ON UPDATE CASCADE;

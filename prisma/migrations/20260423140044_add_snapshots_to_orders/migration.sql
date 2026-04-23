-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "currencySnapshot" TEXT,
ADD COLUMN     "productImageSnapshot" TEXT,
ADD COLUMN     "unitPriceSnapshot" DECIMAL(12,2),
ADD COLUMN     "variantAttributesSnapshot" JSONB;

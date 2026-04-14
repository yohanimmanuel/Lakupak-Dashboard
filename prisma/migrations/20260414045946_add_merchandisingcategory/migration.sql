-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "merchandisingCategorySlug" TEXT,
ADD COLUMN     "salesChannel" TEXT DEFAULT 'Retail';

-- CreateIndex
CREATE INDEX "Product_merchandisingCategorySlug_idx" ON "Product"("merchandisingCategorySlug");

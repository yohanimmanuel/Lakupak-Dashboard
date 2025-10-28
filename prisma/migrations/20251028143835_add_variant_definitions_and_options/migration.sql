-- AlterTable
ALTER TABLE "public"."OrderItem" ADD COLUMN     "variantOptionId" INTEGER;

-- CreateTable
CREATE TABLE "public"."VariantDefinition" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "VariantDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VariantOption" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "variantName" TEXT NOT NULL,
    "attributes" JSONB NOT NULL,
    "sku" TEXT,
    "purchasePrice" TEXT NOT NULL,
    "sellingPrice" TEXT NOT NULL,
    "originalSellingPrice" TEXT,
    "moq" INTEGER,
    "stockQuantity" INTEGER NOT NULL DEFAULT 0,
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 0,
    "stockStatus" TEXT NOT NULL DEFAULT 'In Stock',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "VariantOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VariantDefinition_productId_position_idx" ON "public"."VariantDefinition"("productId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "VariantDefinition_productId_name_key" ON "public"."VariantDefinition"("productId", "name");

-- CreateIndex
CREATE INDEX "VariantOption_productId_isActive_idx" ON "public"."VariantOption"("productId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "VariantOption_productId_variantName_key" ON "public"."VariantOption"("productId", "variantName");

-- AddForeignKey
ALTER TABLE "public"."OrderItem" ADD CONSTRAINT "OrderItem_variantOptionId_fkey" FOREIGN KEY ("variantOptionId") REFERENCES "public"."VariantOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VariantDefinition" ADD CONSTRAINT "VariantDefinition_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VariantOption" ADD CONSTRAINT "VariantOption_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

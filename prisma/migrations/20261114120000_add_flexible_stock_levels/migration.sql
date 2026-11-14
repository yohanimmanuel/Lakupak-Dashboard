-- Flexible packaging-level configuration.
-- Keep NULL for existing products: their old stockUnit may represent Boxes/Cartons,
-- and a safe conversion ratio must be entered explicitly by the distributor.
ALTER TABLE "Product"
ADD COLUMN "stockLevels" JSONB;

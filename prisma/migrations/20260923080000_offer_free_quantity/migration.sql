-- Add freeQuantity for Buy X Get Y / combination discounts

ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "freeQuantity" INTEGER;

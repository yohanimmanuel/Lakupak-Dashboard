-- Add flexible Buy X Get Y apply mode: from first unit vs after product MOQ is satisfied.
ALTER TABLE "OfferDiscountType"
ADD COLUMN IF NOT EXISTS "promotionApplyMode" TEXT DEFAULT 'after_moq';

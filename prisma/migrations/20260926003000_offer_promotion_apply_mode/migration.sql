-- Whether Buy X Get Y free pieces start before the product MOQ or only after it.

ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "promotionApplyMode" TEXT NOT NULL DEFAULT 'after_moq';

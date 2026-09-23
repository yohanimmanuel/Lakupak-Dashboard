-- Auto-apply catalog/base price for first-time marketplace buyers without a client rate.
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "autoApplyBasePriceForFirstBuyers" BOOLEAN NOT NULL DEFAULT false;

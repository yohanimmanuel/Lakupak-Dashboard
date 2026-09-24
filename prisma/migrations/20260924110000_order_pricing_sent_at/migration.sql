-- Track whether pricing was already notified to the buyer (first send vs update).
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "pricingSentAt" TIMESTAMPTZ(3);

-- Add payment confirmation timestamp used for paid-revenue/profit reporting windows.
ALTER TABLE "public"."Order"
ADD COLUMN "paidAt" TIMESTAMPTZ(3);

CREATE INDEX "Order_paidAt_idx" ON "public"."Order"("paidAt");

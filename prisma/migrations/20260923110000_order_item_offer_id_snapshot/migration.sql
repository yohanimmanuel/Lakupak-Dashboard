-- Stable offer id for reversing usage without overwriting the display name snapshot.
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "offerIdSnapshot" TEXT;
CREATE INDEX IF NOT EXISTS "OrderItem_offerIdSnapshot_idx" ON "OrderItem"("offerIdSnapshot");

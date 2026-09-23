-- Link multi-product / multi-variant rate rows into one offer group.
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "groupId" TEXT;
CREATE INDEX IF NOT EXISTS "Offer_groupId_idx" ON "Offer"("groupId");
CREATE INDEX IF NOT EXISTS "Offer_userId_groupId_idx" ON "Offer"("userId", "groupId");

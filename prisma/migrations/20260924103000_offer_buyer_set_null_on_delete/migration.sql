-- Keep Offer rows when a CRM buyer is deleted; only clear the client link.
ALTER TABLE "Offer" DROP CONSTRAINT IF EXISTS "Offer_buyerId_fkey";

ALTER TABLE "Offer"
  ADD CONSTRAINT "Offer_buyerId_fkey"
  FOREIGN KEY ("buyerId") REFERENCES "Buyer"("buyerId")
  ON DELETE SET NULL ON UPDATE CASCADE;

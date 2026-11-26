-- Buyer-to-buyer matches (marketplace access Prospects) may have no order yet.
ALTER TABLE "ClientMatchCandidate" ALTER COLUMN "incomingOrderId" DROP NOT NULL;

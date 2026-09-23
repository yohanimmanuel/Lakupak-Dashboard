-- Manual distributor trust/coverage fields for marketplace profiles.
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "deliveryCoverageArea" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "fulfillmentNotes" TEXT;

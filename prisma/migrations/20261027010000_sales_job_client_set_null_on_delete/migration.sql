-- Allow CRM buyer delete without blocking on linked sales jobs.

ALTER TABLE "SalesJob" DROP CONSTRAINT "SalesJob_clientId_fkey";

ALTER TABLE "SalesJob"
  ADD CONSTRAINT "SalesJob_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Buyer"("buyerId")
  ON DELETE SET NULL ON UPDATE CASCADE;

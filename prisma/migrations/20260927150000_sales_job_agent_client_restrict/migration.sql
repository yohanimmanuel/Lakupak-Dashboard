-- Keep completed job history when a sales rep or buyer is removed.

ALTER TABLE "SalesJob" DROP CONSTRAINT "SalesJob_assignedTo_fkey";
ALTER TABLE "SalesJob" DROP CONSTRAINT "SalesJob_clientId_fkey";

ALTER TABLE "SalesJob" ADD CONSTRAINT "SalesJob_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "SalesAgent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesJob" ADD CONSTRAINT "SalesJob_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Buyer"("buyerId") ON DELETE RESTRICT ON UPDATE CASCADE;

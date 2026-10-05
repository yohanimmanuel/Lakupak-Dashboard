-- One promote or activation job can include more than one client.

ALTER TABLE "SalesJob" ADD COLUMN "clientIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

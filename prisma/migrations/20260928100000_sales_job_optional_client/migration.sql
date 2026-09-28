-- Promote, stock check, new product activation, and competitor check are not tied to a client.

ALTER TABLE "SalesJob" ALTER COLUMN "clientId" DROP NOT NULL;

-- A take-order or collect-payment job can include more than one order.

ALTER TABLE "SalesJob" ADD COLUMN "orderIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

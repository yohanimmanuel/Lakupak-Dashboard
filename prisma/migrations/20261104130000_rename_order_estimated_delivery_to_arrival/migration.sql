ALTER TABLE "Order" RENAME COLUMN "estimatedDeliveryDate" TO "estimatedArrivalDate";
ALTER TABLE "Order" RENAME COLUMN "estimatedDeliveryMinDays" TO "estimatedArrivalMinDays";
ALTER TABLE "Order" RENAME COLUMN "estimatedDeliveryMaxDays" TO "estimatedArrivalMaxDays";

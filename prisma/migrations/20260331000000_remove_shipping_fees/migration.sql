-- Remove shipping fee configuration columns from Company table.
-- Shipping costs are now agreed directly between buyer and distributor,
-- not calculated at checkout. The 3 shipping options (Self Pickup,
-- Seller/Distributor Delivery, Buyer-arranged Courier) have no fees.

ALTER TABLE "Company" DROP COLUMN IF EXISTS "additionalPricePerKm";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "baseShippingPrice";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "baseShippingRadius";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "freeShippingThreshold";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "maxShippingRadius";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "expressShippingPrice";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "nextDayShippingPrice";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "sameDayShippingPrice";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "scheduledDeliveryPrice";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "expressShippingMinDays";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "expressShippingMaxDays";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "sameDayShippingMinDays";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "sameDayShippingMaxDays";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "nextDayShippingMinDays";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "nextDayShippingMaxDays";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "scheduledDeliveryMinDays";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "scheduledDeliveryMaxDays";

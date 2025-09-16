-- AlterTable
ALTER TABLE "public"."Company" ADD COLUMN     "additionalPricePerKm" DOUBLE PRECISION,
ADD COLUMN     "baseShippingPrice" DOUBLE PRECISION,
ADD COLUMN     "baseShippingRadius" DOUBLE PRECISION,
ADD COLUMN     "freeShippingThreshold" DOUBLE PRECISION,
ADD COLUMN     "maxShippingRadius" DOUBLE PRECISION;

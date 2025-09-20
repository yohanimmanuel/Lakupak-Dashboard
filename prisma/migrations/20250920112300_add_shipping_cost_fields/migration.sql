-- Add shipping cost fields to Company table
ALTER TABLE "public"."Company" ADD COLUMN "expressShippingPrice" DOUBLE PRECISION;
ALTER TABLE "public"."Company" ADD COLUMN "sameDayShippingPrice" DOUBLE PRECISION;
ALTER TABLE "public"."Company" ADD COLUMN "nextDayShippingPrice" DOUBLE PRECISION;

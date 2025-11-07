-- AlterTable
ALTER TABLE "public"."Order" ADD COLUMN     "deliveryOption" TEXT,
ADD COLUMN     "preferredDeliveryDate" TIMESTAMPTZ(3),
ADD COLUMN     "preferredPickupDate" TIMESTAMPTZ(3),
ADD COLUMN     "preferredPickupTime" TEXT;

/*
  Warnings:

  - You are about to drop the column `defaultDeliveryLeadTimeDays` on the `Company` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Company" DROP COLUMN "defaultDeliveryLeadTimeDays",
ADD COLUMN     "defaultDeliveryLeadTimeMaxDays" INTEGER,
ADD COLUMN     "defaultDeliveryLeadTimeMinDays" INTEGER,
ADD COLUMN     "expressShippingMaxDays" INTEGER,
ADD COLUMN     "expressShippingMinDays" INTEGER,
ADD COLUMN     "nextDayShippingMaxDays" INTEGER,
ADD COLUMN     "nextDayShippingMinDays" INTEGER,
ADD COLUMN     "sameDayShippingMaxDays" INTEGER,
ADD COLUMN     "sameDayShippingMinDays" INTEGER,
ADD COLUMN     "scheduledDeliveryMaxDays" INTEGER,
ADD COLUMN     "scheduledDeliveryMinDays" INTEGER;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "estimatedDeliveryMaxDays" INTEGER,
ADD COLUMN     "estimatedDeliveryMinDays" INTEGER;

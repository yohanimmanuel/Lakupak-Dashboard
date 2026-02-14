-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "defaultDeliveryLeadTimeDays" INTEGER;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "estimatedDeliveryDate" TIMESTAMPTZ(3);

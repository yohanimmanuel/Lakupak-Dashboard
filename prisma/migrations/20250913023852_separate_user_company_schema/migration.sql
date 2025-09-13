/*
  Warnings:

  - You are about to drop the column `address` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `company` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."User" DROP COLUMN "address",
DROP COLUMN "company",
ADD COLUMN     "companyId" INTEGER;

-- CreateTable
CREATE TABLE "public"."Company" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "businessRegistrationNumber" TEXT,
    "taxId" TEXT,
    "logo" TEXT,
    "industryType" TEXT,
    "businessDescription" TEXT,
    "yearsInOperation" TEXT,
    "companySize" TEXT,
    "businessAddress" TEXT,
    "businessPhone" TEXT,
    "businessEmail" TEXT,
    "documentVerification" BOOLEAN NOT NULL DEFAULT false,
    "businessLicenseVerification" BOOLEAN NOT NULL DEFAULT false,
    "complianceStatus" TEXT NOT NULL DEFAULT 'Pending',
    "shippingPreferences" TEXT,
    "deliveryTimeSlots" TEXT,
    "preferredDeliveryDays" TEXT,
    "deliveryRadius" TEXT,
    "specialInstructions" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

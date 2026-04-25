-- CreateEnum
CREATE TYPE "PaymentMethodType" AS ENUM ('CARD', 'BANK_TRANSFER', 'VIRTUAL_ACCOUNT', 'COD');

-- CreateEnum
CREATE TYPE "PaymentMethodStatus" AS ENUM ('ACTIVE', 'PENDING', 'EXPIRED', 'DISABLED');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "billingAddressLine1" TEXT,
ADD COLUMN     "billingBankAccountName" TEXT,
ADD COLUMN     "billingBankAccountNumber" TEXT,
ADD COLUMN     "billingBankName" TEXT,
ADD COLUMN     "billingCity" TEXT,
ADD COLUMN     "billingCompanyName" TEXT,
ADD COLUMN     "billingContactEmail" TEXT,
ADD COLUMN     "billingContactPhone" TEXT,
ADD COLUMN     "billingCountry" TEXT,
ADD COLUMN     "billingPostalCode" TEXT,
ADD COLUMN     "billingState" TEXT;

-- CreateTable
CREATE TABLE "PaymentMethod" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "type" "PaymentMethodType" NOT NULL,
    "label" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" "PaymentMethodStatus" NOT NULL DEFAULT 'ACTIVE',
    "cardBrand" TEXT,
    "cardLast4" TEXT,
    "cardExpMonth" INTEGER,
    "cardExpYear" INTEGER,
    "bankName" TEXT,
    "accountName" TEXT,
    "accountNumber" TEXT,
    "provider" TEXT,
    "providerRef" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentMethod_companyId_idx" ON "PaymentMethod"("companyId");

-- CreateIndex
CREATE INDEX "PaymentMethod_companyId_type_idx" ON "PaymentMethod"("companyId", "type");

-- CreateIndex
CREATE INDEX "PaymentMethod_companyId_isDefault_idx" ON "PaymentMethod"("companyId", "isDefault");

-- AddForeignKey
ALTER TABLE "PaymentMethod" ADD CONSTRAINT "PaymentMethod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

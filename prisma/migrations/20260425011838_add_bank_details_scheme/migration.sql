/*
  Warnings:

  - You are about to drop the `PaymentMethod` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "CompanyPaymentMethodKind" AS ENUM ('CARD', 'BANK_TRANSFER', 'EWALLET');

-- CreateEnum
CREATE TYPE "CompanyPaymentMethodStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'PENDING');

-- DropForeignKey
ALTER TABLE "PaymentMethod" DROP CONSTRAINT "PaymentMethod_companyId_fkey";

-- DropTable
DROP TABLE "PaymentMethod";

-- DropEnum
DROP TYPE "PaymentMethodStatus";

-- DropEnum
DROP TYPE "PaymentMethodType";

-- CreateTable
CREATE TABLE "CompanyPaymentMethod" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "kind" "CompanyPaymentMethodKind" NOT NULL,
    "label" TEXT NOT NULL,
    "last4" TEXT,
    "expiryMonth" INTEGER,
    "expiryYear" INTEGER,
    "bankName" TEXT,
    "accountHolderName" TEXT,
    "accountNumberLast4" TEXT,
    "ewalletProvider" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" "CompanyPaymentMethodStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CompanyPaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyPaymentMethod_companyId_idx" ON "CompanyPaymentMethod"("companyId");

-- CreateIndex
CREATE INDEX "CompanyPaymentMethod_companyId_isDefault_idx" ON "CompanyPaymentMethod"("companyId", "isDefault");

-- AddForeignKey
ALTER TABLE "CompanyPaymentMethod" ADD CONSTRAINT "CompanyPaymentMethod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

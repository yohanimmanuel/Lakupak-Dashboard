-- CreateEnum
CREATE TYPE "CommissionInvoiceStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE', 'VOID');

-- CreateTable
CREATE TABLE "CommissionInvoice" (
    "id" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "billingMonth" TIMESTAMPTZ(3) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "status" "CommissionInvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMPTZ(3),
    "description" TEXT,
    "documentUrl" TEXT NOT NULL,
    "documentPublicId" TEXT,
    "createdByAdminId" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CommissionInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommissionInvoice_invoiceNo_key" ON "CommissionInvoice"("invoiceNo");

-- CreateIndex
CREATE INDEX "CommissionInvoice_companyId_billingMonth_idx" ON "CommissionInvoice"("companyId", "billingMonth");

-- CreateIndex
CREATE INDEX "CommissionInvoice_companyId_status_idx" ON "CommissionInvoice"("companyId", "status");

-- CreateIndex
CREATE INDEX "CommissionInvoice_issuedAt_idx" ON "CommissionInvoice"("issuedAt");

-- CreateIndex
CREATE INDEX "CommissionInvoice_dueAt_idx" ON "CommissionInvoice"("dueAt");

-- AddForeignKey
ALTER TABLE "CommissionInvoice" ADD CONSTRAINT "CommissionInvoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionInvoice" ADD CONSTRAINT "CommissionInvoice_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "PlatformAdmin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

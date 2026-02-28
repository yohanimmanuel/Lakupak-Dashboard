-- CreateTable
CREATE TABLE "DriverRequest" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "distributorEmail" TEXT NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DriverRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DriverRequest_distributorEmail_idx" ON "DriverRequest"("distributorEmail");

-- CreateIndex
CREATE INDEX "DriverRequest_status_idx" ON "DriverRequest"("status");

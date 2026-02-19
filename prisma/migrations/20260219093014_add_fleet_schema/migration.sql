-- CreateTable
CREATE TABLE "Fleet" (
    "id" SERIAL NOT NULL,
    "fleetCode" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "route" TEXT NOT NULL,
    "routeFrom" TEXT,
    "routeTo" TEXT,
    "status" TEXT NOT NULL,
    "deliveryType" TEXT,
    "eta" TEXT NOT NULL,
    "lastUpdate" TEXT NOT NULL,
    "driverName" TEXT NOT NULL,
    "driverPhone" TEXT,
    "driverExperience" TEXT,
    "driverStatus" TEXT,
    "driverAvatar" TEXT,
    "vehicleType" TEXT,
    "vehicleBrand" TEXT,
    "vehicleModel" TEXT,
    "vehicleMaxWeight" INTEGER,
    "vehicleMaxVolume" DOUBLE PRECISION,
    "loadPct" INTEGER,
    "paymentTerms" TEXT,
    "totalOrders" INTEGER,
    "deliveriesCompleted" INTEGER,
    "assignedOrderIds" JSONB,
    "completedOrderIds" JSONB,
    "customers" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Fleet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Fleet_userId_idx" ON "Fleet"("userId");

-- CreateIndex
CREATE INDEX "Fleet_userId_status_idx" ON "Fleet"("userId", "status");

-- AddForeignKey
ALTER TABLE "Fleet" ADD CONSTRAINT "Fleet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

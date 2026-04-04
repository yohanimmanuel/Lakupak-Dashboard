-- CreateTable
CREATE TABLE "DriverPushNotificationToken" (
    "id" SERIAL NOT NULL,
    "driverId" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DriverPushNotificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DriverPushNotificationToken_token_key" ON "DriverPushNotificationToken"("token");

-- CreateIndex
CREATE INDEX "DriverPushNotificationToken_driverId_idx" ON "DriverPushNotificationToken"("driverId");

-- CreateIndex
CREATE INDEX "DriverPushNotificationToken_token_idx" ON "DriverPushNotificationToken"("token");

-- CreateIndex
CREATE INDEX "DriverPushNotificationToken_isActive_idx" ON "DriverPushNotificationToken"("isActive");

-- AddForeignKey
ALTER TABLE "DriverPushNotificationToken" ADD CONSTRAINT "DriverPushNotificationToken_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

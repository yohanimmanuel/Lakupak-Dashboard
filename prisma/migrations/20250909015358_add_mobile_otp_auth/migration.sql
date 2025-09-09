-- CreateTable
CREATE TABLE "public"."OtpCode" (
    "id" SERIAL NOT NULL,
    "phone" TEXT NOT NULL,
    "countryCode" TEXT,
    "channel" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OtpCode_phone_createdAt_idx" ON "public"."OtpCode"("phone", "createdAt");

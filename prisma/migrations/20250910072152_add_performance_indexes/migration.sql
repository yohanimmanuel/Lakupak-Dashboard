-- CreateIndex
CREATE INDEX "Address_userId_idx" ON "public"."Address"("userId");

-- CreateIndex
CREATE INDEX "Address_isDefault_idx" ON "public"."Address"("isDefault");

-- CreateIndex
CREATE INDEX "Address_userId_isDefault_idx" ON "public"."Address"("userId", "isDefault");

-- CreateIndex
CREATE INDEX "MarketplaceUser_phone_idx" ON "public"."MarketplaceUser"("phone");

-- CreateIndex
CREATE INDEX "MarketplaceUser_email_idx" ON "public"."MarketplaceUser"("email");

-- CreateIndex
CREATE INDEX "MarketplaceUser_createdAt_idx" ON "public"."MarketplaceUser"("createdAt");

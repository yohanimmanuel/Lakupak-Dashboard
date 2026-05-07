-- CreateIndex
CREATE INDEX "DistributorReview_distributorId_createdAt_idx" ON "DistributorReview"("distributorId", "createdAt");

-- CreateIndex
CREATE INDEX "DistributorReview_userId_createdAt_idx" ON "DistributorReview"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_userId_isDeleted_createdAt_idx" ON "Order"("userId", "isDeleted", "createdAt");

-- CreateIndex
CREATE INDEX "Order_userId_isDeleted_orderDate_idx" ON "Order"("userId", "isDeleted", "orderDate");

-- CreateIndex
CREATE INDEX "Order_buyerId_createdAt_idx" ON "Order"("buyerId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_buyerId_orderDate_idx" ON "Order"("buyerId", "orderDate");

-- CreateIndex
CREATE INDEX "Order_fleetId_createdAt_idx" ON "Order"("fleetId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_orderStatus_createdAt_idx" ON "Order"("orderStatus", "createdAt");

-- CreateIndex
CREATE INDEX "OrderCancellation_marketplaceUserId_cancelledAt_idx" ON "OrderCancellation"("marketplaceUserId", "cancelledAt");

-- CreateIndex
CREATE INDEX "OrderDeliveryReview_userId_createdAt_idx" ON "OrderDeliveryReview"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderFailedReason_orderId_createdAt_idx" ON "OrderFailedReason"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderFailedReason_driverId_createdAt_idx" ON "OrderFailedReason"("driverId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_createdAt_idx" ON "OrderItem"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderItem_productId_createdAt_idx" ON "OrderItem"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderReturnRequest_orderId_createdAt_idx" ON "OrderReturnRequest"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderReturnRequest_marketplaceUserId_createdAt_idx" ON "OrderReturnRequest"("marketplaceUserId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderReturnRequest_status_createdAt_idx" ON "OrderReturnRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ProductReview_productId_createdAt_idx" ON "ProductReview"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductReview_orderId_createdAt_idx" ON "ProductReview"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductReview_userId_createdAt_idx" ON "ProductReview"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "VariantOption_productId_createdAt_idx" ON "VariantOption"("productId", "createdAt");

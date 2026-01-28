-- CreateIndex
CREATE INDEX "Order_userId_idx" ON "Order"("userId");

-- CreateIndex
CREATE INDEX "Order_orderStatus_idx" ON "Order"("orderStatus");

-- CreateIndex
CREATE INDEX "Order_paymentStatus_idx" ON "Order"("paymentStatus");

-- CreateIndex
CREATE INDEX "Order_buyerId_idx" ON "Order"("buyerId");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "Order_orderDate_idx" ON "Order"("orderDate");

-- CreateIndex
CREATE INDEX "Order_archivedAt_idx" ON "Order"("archivedAt");

-- CreateIndex
CREATE INDEX "Order_isDeleted_idx" ON "Order"("isDeleted");

-- CreateIndex
CREATE INDEX "Order_userId_orderStatus_isDeleted_idx" ON "Order"("userId", "orderStatus", "isDeleted");

-- CreateIndex
CREATE INDEX "Order_userId_isDeleted_archivedAt_idx" ON "Order"("userId", "isDeleted", "archivedAt");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_productId_idx" ON "OrderItem"("orderId", "productId");

-- CreateIndex
CREATE INDEX "Product_userId_idx" ON "Product"("userId");

-- CreateIndex
CREATE INDEX "Product_status_idx" ON "Product"("status");

-- CreateIndex
CREATE INDEX "Product_marketplaceStatus_idx" ON "Product"("marketplaceStatus");

-- CreateIndex
CREATE INDEX "Product_productCategory_idx" ON "Product"("productCategory");

-- CreateIndex
CREATE INDEX "Product_userId_marketplaceStatus_idx" ON "Product"("userId", "marketplaceStatus");

-- CreateIndex
CREATE INDEX "Product_createdAt_idx" ON "Product"("createdAt");

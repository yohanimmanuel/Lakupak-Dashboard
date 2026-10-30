-- Lookups by distributor, variant option, and WhatsApp message id.

CREATE INDEX "Supplier_userId_idx" ON "Supplier"("userId");

CREATE INDEX "OrderItem_variantOptionId_idx" ON "OrderItem"("variantOptionId");

CREATE INDEX "SalesJob_whatsappMessageId_idx" ON "SalesJob"("whatsappMessageId");

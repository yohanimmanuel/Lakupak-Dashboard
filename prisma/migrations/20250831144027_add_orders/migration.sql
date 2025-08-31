-- CreateTable
CREATE TABLE "public"."Order" (
    "id" SERIAL NOT NULL,
    "orderId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "orderDate" TIMESTAMP(3) NOT NULL,
    "orderStatus" TEXT NOT NULL,
    "paymentStatus" TEXT NOT NULL,
    "deliveryMethod" TEXT NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "discounts" DOUBLE PRECISION NOT NULL,
    "taxes" DOUBLE PRECISION NOT NULL,
    "shippingFee" DOUBLE PRECISION NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "paymentTerms" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "shopEarnings" DOUBLE PRECISION NOT NULL,
    "totalOrders" DOUBLE PRECISION NOT NULL,
    "contactPerson" TEXT NOT NULL,
    "storeName" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "customerEmail" TEXT,
    "deliveryAddress" TEXT NOT NULL,
    "preferredDeliveryTime" TEXT,
    "assignedLogistics" TEXT,
    "trackingNumber" TEXT,
    "deliveryNote" TEXT,
    "deliveryConfirmation" TEXT,
    "pod" TEXT,
    "orderItems" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "acceptedBy" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "userId" INTEGER,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderId_key" ON "public"."Order"("orderId");

-- AddForeignKey
ALTER TABLE "public"."Order" ADD CONSTRAINT "Order_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "public"."Buyer"("buyerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

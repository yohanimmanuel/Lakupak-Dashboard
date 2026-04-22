import { describe, beforeEach, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { NextRequest } from 'next/server';
import { resetDb } from './helpers';
import { updateOrderHandler } from '@/services/orders/updateOrder';

function makeNextRequest(url: string, body: unknown) {
  const req = new Request(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
    body: JSON.stringify(body),
  });
  return new NextRequest(req);
}

describe('orders update - atomicity on failure', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('rolls back stock and status when order-item recreation throws', async () => {
    const distributor = await prisma.user.create({
      data: { email: 'dist-atomic@example.com', password: 'x' },
      select: { id: true },
    });

    const goodProduct = await prisma.product.create({
      data: {
        productId: 'P-ATOMIC-GOOD',
        sku: 'SKU-ATOMIC-GOOD',
        name: 'Atomic Good Product',
        description: 'Test',
        productType: 'TestType',
        brand: 'TestBrand',
        supplier: 'TestSupplier',
        status: 'Published',
        productCategory: 'Retail',
        catalogName: 'Default',
        images: [],
        marketplaceStatus: 'Published',
        userId: distributor.id,
      },
      select: { id: true, productId: true },
    });

    const goodVariant = await prisma.variantOption.create({
      data: {
        productId: goodProduct.id,
        variantName: 'Default',
        attributes: {},
        purchasePrice: 1000,
        sellingPrice: 2000,
        originalSellingPrice: 2000,
        moq: 1,
        stockQuantity: 10,
        lowStockThreshold: 0,
        stockStatus: 'In Stock',
        isDefault: true,
        isActive: true,
      },
      select: { id: true },
    });

    // Product intentionally has NO variantOptions; updateOrder's orderItem recreation should throw.
    const badProduct = await prisma.product.create({
      data: {
        productId: 'P-ATOMIC-BAD',
        sku: 'SKU-ATOMIC-BAD',
        name: 'Atomic Bad Product',
        description: 'Test',
        productType: 'TestType',
        brand: 'TestBrand',
        supplier: 'TestSupplier',
        status: 'Published',
        productCategory: 'Retail',
        catalogName: 'Default',
        images: [],
        marketplaceStatus: 'Published',
        userId: distributor.id,
      },
      select: { productId: true },
    });

    const orderId = 'LKO-20001';
    await prisma.order.create({
      data: {
        orderId,
        orderDate: new Date(),
        orderStatus: 'Pending',
        paymentStatus: 'Unpaid',
        deliveryMethod: 'Seller/Distributor Delivery',
        deliveryOption: null,
        subtotal: 2000,
        discounts: 0,
        shippingFee: 0,
        totalAmount: 2000,
        paymentTerms: 'Cash on Delivery',
        totalOrders: 1,
        contactPerson: 'Tester',
        storeName: 'Test Store',
        contactPhone: '123',
        customerEmail: null,
        deliveryAddress: 'Addr',
        preferredDeliveryDate: null,
        preferredDeliveryTime: null,
        preferredPickupDate: null,
        preferredPickupTime: null,
        shippingMethodLabel: null,
        shippingMethod: null,
        userId: distributor.id,
        buyerId: null,
        buyerIdSnapshot: null,
        contactPersonSnapshot: null,
        contactPhoneSnapshot: null,
        customerEmailSnapshot: null,
        deliveryAddressSnapshot: null,
        orderDateSnapshot: null,
        storeNameSnapshot: null,
      },
    });

    await prisma.orderItem.create({
      data: {
        orderId,
        productId: goodProduct.productId,
        subtotal: 2000,
        packageType: 'Box',
        piecesPerPackage: 1,
        packageQuantity: 2, // would deduct 2 on Pending -> Confirmed
        pricePerPackage: 1000,
        productNameSnapshot: 'Atomic Good Product',
        productSkuSnapshot: 'SKU-ATOMIC-GOOD',
        productTypeSnapshot: 'TestType',
        variantOptionId: goodVariant.id,
        variantNameSnapshot: 'Default',
        offerApplied: false,
        promotionDetailsSnapshot: null,
        moqSnapshot: 1,
      } as any,
    });

    const beforeVariant = await prisma.variantOption.findUnique({ where: { id: goodVariant.id } });
    expect(beforeVariant?.stockQuantity).toBe(10);

    const res = await updateOrderHandler(
      makeNextRequest('http://localhost/api/orders', {
        orderId,
        userId: distributor.id,
        orderStatus: 'Confirmed', // triggers deduct
        orderItems: [
          // This will cause order-item recreation to throw (no variants with pricing).
          { productId: badProduct.productId, quantity: 1, packageQuantity: 1, piecesPerPackage: 1, pricePerPackage: 1, subtotal: 1, productName: 'x' },
        ],
      }),
    );

    // Handler wraps errors -> 500
    expect(res.status).toBe(500);

    const afterOrder = await prisma.order.findUnique({ where: { orderId } });
    expect(afterOrder?.orderStatus).toBe('Pending');

    const afterVariant = await prisma.variantOption.findUnique({ where: { id: goodVariant.id } });
    expect(afterVariant?.stockQuantity).toBe(10);
  });
});


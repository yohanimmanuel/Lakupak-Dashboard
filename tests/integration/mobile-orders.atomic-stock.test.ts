import { describe, beforeEach, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { createMobileMarketplaceOrders } from '@/services/mobileOrders/mobileOrdersService';
import { NextRequest } from 'next/server';
import { resetDb } from './helpers';

function makeNextRequest(url: string, body: unknown) {
  const req = new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return new NextRequest(req);
}

describe('mobile orders - atomic stock reservation', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('prevents oversell under concurrent checkouts', async () => {
    const distributor = await prisma.user.create({
      data: {
        email: 'dist@example.com',
        firstName: 'Dist',
        lastName: 'One',
        password: 'x',
      },
      select: { id: true },
    });

    const buyer = await prisma.marketplaceUser.create({
      data: {
        username: 'buyer1',
        phone: '+620000000001',
        email: 'buyer1@example.com',
        name: 'Buyer One',
        storeName: 'Buyer Store',
        chosenAddress: 'Address',
      },
      select: { id: true },
    });

    const product = await prisma.product.create({
      data: {
        productId: 'P-1',
        sku: 'SKU-1',
        name: 'Test Product',
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
      select: { id: true, productId: true, name: true },
    });

    const variant = await prisma.variantOption.create({
      data: {
        productId: product.id,
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

    const commonBody = {
      orderDate: new Date().toISOString(),
      orderItems: [
        {
          productId: product.productId,
          quantity: 1,
          priceAtPurchase: '2000',
          subtotal: '2000',
          packageQuantity: 6, // total pieces needed = 6
          piecesPerPackage: 1,
          productName: product.name,
          productSku: 'SKU-1',
          variantId: variant.id,
          category: 'TestType',
        },
      ],
      discounts: 0,
      shippingFee: 0,
      contactPerson: 'Buyer',
      storeName: 'Buyer Store',
      contactPhone: '+620000000001',
      customerEmail: 'buyer1@example.com',
      deliveryAddress: 'Address',
      deliveryMethod: 'Seller/Distributor Delivery',
      deliveryOption: null,
      orderStatus: 'Pending',
      paymentStatus: 'Unpaid',
      paymentTerms: 'Cash on Delivery',
      preferredDeliveryDate: null,
      preferredDeliveryTime: null,
      preferredPickupDate: null,
      preferredPickupTime: null,
      shippingMethodLabel: null,
      shippingMethod: null,
      estimatedDeliveryMinDays: null,
      estimatedDeliveryMaxDays: null,
      userId: buyer.id,
    };

    const req1 = makeNextRequest('http://localhost/api/mobile/orders', { ...commonBody, orderId: 'O-1' });
    const req2 = makeNextRequest('http://localhost/api/mobile/orders', { ...commonBody, orderId: 'O-2' });

    const [r1, r2] = await Promise.allSettled([
      createMobileMarketplaceOrders(req1, buyer.id),
      createMobileMarketplaceOrders(req2, buyer.id),
    ]);

    const responses = [r1, r2].map((r) => (r.status === 'fulfilled' ? r.value : null)).filter(Boolean) as Response[];
    expect(responses).toHaveLength(2);

    const statusCodes = await Promise.all(responses.map((r) => r.status));
    expect(statusCodes.sort()).toEqual([201, 400]);

    const ordersCount = await prisma.order.count();
    expect(ordersCount).toBe(1);

    const updatedVariant = await prisma.variantOption.findUnique({ where: { id: variant.id } });
    expect(updatedVariant?.stockQuantity).toBe(4);
  });
});


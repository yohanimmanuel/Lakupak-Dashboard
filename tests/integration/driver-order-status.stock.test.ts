import { describe, beforeEach, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { signAccessToken } from '@/lib/jwt';
import { ensureIntegrationAuthEnv, resetDb } from './helpers';
import { PATCH } from '@/app/api/driver/orders/[orderId]/status/route';

function makeDriverPatchRequest(orderId: string, body: unknown, driverId: number): NextRequest {
  ensureIntegrationAuthEnv();
  const token = signAccessToken({ sub: driverId, type: 'driver' });
  const req = new Request(`http://localhost/api/driver/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      'x-forwarded-for': '127.0.0.1',
    },
    body: JSON.stringify(body),
  });
  return new NextRequest(req);
}

async function seedShippedOrderWithFleet(opts: {
  orderId: string;
  productId: string;
  sku: string;
  stockQuantity: number;
  packageQuantity: number;
}) {
  const distributor = await prisma.user.create({
    data: { email: `dist-${opts.orderId}@example.com`, password: 'x' },
    select: { id: true },
  });

  const driver = await prisma.driver.create({
    data: {
      userId: distributor.id,
      name: 'Test Driver',
      username: `driver-${opts.orderId}`,
      passwordHash: 'x',
    },
    select: { id: true },
  });

  const fleet = await prisma.fleet.create({
    data: {
      fleetCode: `#FLEET-${opts.orderId}`,
      userId: distributor.id,
      route: 'Route A',
      status: 'In Transit',
      lastUpdate: new Date().toISOString(),
      driverId: driver.id,
    },
    select: { id: true },
  });

  const product = await prisma.product.create({
    data: {
      productId: opts.productId,
      sku: opts.sku,
      name: 'Driver Failed Product',
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

  const variant = await prisma.variantOption.create({
    data: {
      productId: product.id,
      variantName: 'Default',
      attributes: {},
      purchasePrice: 1000,
      sellingPrice: 2000,
      originalSellingPrice: 2000,
      moq: 1,
      stockQuantity: opts.stockQuantity,
      lowStockThreshold: 0,
      stockStatus: 'In Stock',
      isDefault: true,
      isActive: true,
    },
    select: { id: true },
  });

  await prisma.order.create({
    data: {
      orderId: opts.orderId,
      orderDate: new Date(),
      orderStatus: 'Shipped',
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
      userId: distributor.id,
      buyerId: null,
      fleetId: fleet.id,
    },
  });

  await prisma.orderItem.create({
    data: {
      orderId: opts.orderId,
      productId: product.productId,
      subtotal: 2000,
      packageType: 'Box',
      piecesPerPackage: 1,
      packageQuantity: opts.packageQuantity,
      pricePerPackage: 1000,
      productNameSnapshot: 'Driver Failed Product',
      productSkuSnapshot: opts.sku,
      productTypeSnapshot: 'TestType',
      variantOptionId: variant.id,
      variantNameSnapshot: 'Default',
      offerApplied: false,
      promotionDetailsSnapshot: null,
      moqSnapshot: 1,
    },
  });

  return { driverId: driver.id, variantId: variant.id };
}

describe('driver order status - stock restore on Failed delivery', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('restores stock when driver marks a Shipped order as Failed', async () => {
    const orderId = 'LKO-DRV-FAIL-1';
    const { driverId, variantId } = await seedShippedOrderWithFleet({
      orderId,
      productId: 'P-DRV-FAIL-1',
      sku: 'SKU-DRV-FAIL-1',
      stockQuantity: 8, // 2 pieces already deducted before shipping
      packageQuantity: 2,
    });

    const res = await PATCH(
      makeDriverPatchRequest(orderId, { orderStatus: 'Failed', failureReason: 'Customer not home' }, driverId),
      { params: Promise.resolve({ orderId }) },
    );

    expect(res.status).toBe(200);
    const updatedOrder = await prisma.order.findFirst({ where: { orderId } });
    expect(updatedOrder?.orderStatus).toBe('Failed');
    const updatedVariant = await prisma.variantOption.findUnique({ where: { id: variantId } });
    expect(updatedVariant?.stockQuantity).toBe(10);
  });

  it('does not change stock when driver marks a Shipped order as Delivered', async () => {
    const orderId = 'LKO-DRV-DELIVERED-1';
    const { driverId, variantId } = await seedShippedOrderWithFleet({
      orderId,
      productId: 'P-DRV-DELIVERED-1',
      sku: 'SKU-DRV-DELIVERED-1',
      stockQuantity: 8,
      packageQuantity: 2,
    });

    const res = await PATCH(
      makeDriverPatchRequest(orderId, { orderStatus: 'Delivered' }, driverId),
      { params: Promise.resolve({ orderId }) },
    );

    expect(res.status).toBe(200);
    const updatedOrder = await prisma.order.findFirst({ where: { orderId } });
    expect(updatedOrder?.orderStatus).toBe('Delivered');
    const updatedVariant = await prisma.variantOption.findUnique({ where: { id: variantId } });
    expect(updatedVariant?.stockQuantity).toBe(8);
  });
});

import { describe, beforeEach, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { ensureMarketplaceMembership } from '@/lib/marketplace/access';
import { createMobileMarketplaceOrders } from '@/services/mobileOrders/mobileOrdersService';
import { updateOrderHandler } from '@/services/orders/updateOrder';
import {
  ensureIntegrationAuthEnv,
  makeAuthenticatedDashboardPutRequest,
  makeAuthenticatedMarketplacePostRequest,
  resetDb,
} from './helpers';

describe('mobile orders - checkout and confirm stock', () => {
  beforeEach(async () => {
    ensureIntegrationAuthEnv();
    await resetDb();
  });

  it('allows concurrent pending orders without checkout-time stock decrement', async () => {
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

    const membership = await ensureMarketplaceMembership(buyer.id, distributor.id);
    expect(membership).toEqual({ ok: true });

    const commonBody = {
      orderDate: new Date().toISOString(),
      orderItems: [
        {
          productId: product.productId,
          quantity: 1,
          priceAtPurchase: '2000',
          subtotal: '2000',
          packageQuantity: 6,
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

    const req1 = makeAuthenticatedMarketplacePostRequest(
      'http://localhost/api/mobile/orders',
      { ...commonBody, orderId: 'O-1' },
      buyer.id,
      distributor.id,
    );
    const req2 = makeAuthenticatedMarketplacePostRequest(
      'http://localhost/api/mobile/orders',
      { ...commonBody, orderId: 'O-2' },
      buyer.id,
      distributor.id,
    );

    const [r1, r2] = await Promise.allSettled([
      createMobileMarketplaceOrders(req1, buyer.id),
      createMobileMarketplaceOrders(req2, buyer.id),
    ]);

    const responses = [r1, r2].map((r) => (r.status === 'fulfilled' ? r.value : null)).filter(Boolean) as Response[];
    expect(responses).toHaveLength(2);

    const statusCodes = await Promise.all(responses.map((r) => r.status));
    expect(statusCodes.sort()).toEqual([201, 201]);

    expect(await prisma.order.count()).toBe(2);

    const updatedVariant = await prisma.variantOption.findUnique({ where: { id: variant.id } });
    expect(updatedVariant?.stockQuantity).toBe(10);
  });

  it('prevents oversell when concurrent Pending orders are confirmed', async () => {
    const distributor = await prisma.user.create({
      data: { email: 'dist-confirm@example.com', password: 'x' },
      select: { id: true },
    });

    const buyer = await prisma.marketplaceUser.create({
      data: {
        username: 'buyer_confirm',
        phone: '+620000000002',
        email: 'buyer_confirm@example.com',
        name: 'Buyer Confirm',
        storeName: 'Buyer Store',
        chosenAddress: 'Address',
      },
      select: { id: true },
    });

    const product = await prisma.product.create({
      data: {
        productId: 'P-CONFIRM-1',
        sku: 'SKU-CONFIRM-1',
        name: 'Confirm Product',
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
        stockQuantity: 6,
        lowStockThreshold: 0,
        stockStatus: 'In Stock',
        isDefault: true,
        isActive: true,
      },
      select: { id: true },
    });

    const checkoutBody = {
      orderDate: new Date().toISOString(),
      orderItems: [
        {
          productId: product.productId,
          quantity: 1,
          priceAtPurchase: '2000',
          subtotal: '2000',
          packageQuantity: 6,
          piecesPerPackage: 1,
          productName: product.name,
          productSku: 'SKU-CONFIRM-1',
          variantId: variant.id,
          category: 'TestType',
        },
      ],
      discounts: 0,
      shippingFee: 0,
      contactPerson: 'Buyer',
      storeName: 'Buyer Store',
      contactPhone: '+620000000002',
      customerEmail: 'buyer_confirm@example.com',
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

    const membership = await ensureMarketplaceMembership(buyer.id, distributor.id);
    expect(membership).toEqual({ ok: true });

    for (const orderId of ['LKO-90001', 'LKO-90002']) {
      const res = await createMobileMarketplaceOrders(
        makeAuthenticatedMarketplacePostRequest(
          'http://localhost/api/mobile/orders',
          { ...checkoutBody, orderId },
          buyer.id,
          distributor.id,
        ),
        buyer.id,
      );
      expect(res.status).toBe(201);
    }

    const [confirm1, confirm2] = await Promise.allSettled([
      updateOrderHandler(
        makeAuthenticatedDashboardPutRequest(
          'http://localhost/api/orders',
          { orderId: 'LKO-90001', userId: distributor.id, orderStatus: 'Confirmed' },
          distributor.id,
        ),
      ),
      updateOrderHandler(
        makeAuthenticatedDashboardPutRequest(
          'http://localhost/api/orders',
          { orderId: 'LKO-90002', userId: distributor.id, orderStatus: 'Confirmed' },
          distributor.id,
        ),
      ),
    ]);

    const confirmResponses = [confirm1, confirm2]
      .map((r) => (r.status === 'fulfilled' ? r.value : null))
      .filter(Boolean) as Response[];
    expect(confirmResponses).toHaveLength(2);

    const confirmStatuses = await Promise.all(confirmResponses.map((r) => r.status));
    expect(confirmStatuses.sort()).toEqual([200, 500]);

    const orders = await prisma.order.findMany({
      where: { orderId: { in: ['LKO-90001', 'LKO-90002'] } },
      select: { orderId: true, orderStatus: true },
    });
    const confirmedCount = orders.filter((o) => o.orderStatus === 'Confirmed').length;
    const pendingCount = orders.filter((o) => o.orderStatus === 'Pending').length;
    expect(confirmedCount).toBe(1);
    expect(pendingCount).toBe(1);

    const updatedVariant = await prisma.variantOption.findUnique({ where: { id: variant.id } });
    expect(updatedVariant?.stockQuantity).toBe(0);
  });
});

import { describe, beforeEach, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import {
  makeAuthenticatedDashboardPutRequest,
  makeAuthenticatedLegacyPutRequest,
  makeAuthenticatedMarketplacePutRequest,
  resetDb,
} from './helpers';
import { updateOrderHandler } from '@/services/orders/updateOrder';
import { buildMobileBuyerId } from '@/utils/buyerSync';
import { createMarketplaceBuyer } from './test-fixtures';

describe('orders update - cancel authorization', () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function seedPendingOrder(opts: {
    distributorUserId: number;
    marketplaceBuyerId?: number | null;
    orderId?: string;
  }) {
    const orderId = opts.orderId ?? 'LKO-CANCEL-1';
    const buyerId =
      opts.marketplaceBuyerId != null
        ? buildMobileBuyerId(opts.marketplaceBuyerId, opts.distributorUserId)
        : null;

    if (buyerId) {
      await prisma.buyer.create({
        data: {
          buyerId,
          owner: 'Test Buyer',
          email: 'buyer@test.com',
          phone: '0800000000',
          storeName: 'Test Store',
          businessType: 'Retail',
          address: 'Test Address',
          status: 'Active',
          userId: opts.distributorUserId,
        },
      });
    }

    await prisma.order.create({
      data: {
        orderId,
        buyerId,
        orderDate: new Date(),
        orderStatus: 'Pending',
        paymentStatus: 'Unpaid',
        deliveryMethod: 'Seller/Distributor Delivery',
        deliveryOption: null,
        subtotal: 1000,
        discounts: 0,
        shippingFee: 0,
        totalAmount: 1000,
        paymentTerms: 'Cash on Delivery',
        totalOrders: 1,
        contactPerson: 'Buyer',
        storeName: 'Store',
        contactPhone: '123',
        customerEmail: null,
        deliveryAddress: 'Addr',
        preferredDeliveryDate: null,
        preferredDeliveryTime: null,
        preferredPickupDate: null,
        preferredPickupTime: null,
        shippingMethodLabel: null,
        shippingMethod: null,
        userId: opts.distributorUserId,
      },
    });
    return orderId;
  }

  it('allows marketplace buyer to cancel their order', async () => {
    const distributor = await prisma.user.create({
      data: { email: 'dist-cancel@example.com', password: 'x' },
      select: { id: true },
    });
    const buyer = await createMarketplaceBuyer();
    const orderId = await seedPendingOrder({
      distributorUserId: distributor.id,
      marketplaceBuyerId: buyer.id,
    });

    const res = await updateOrderHandler(
      makeAuthenticatedMarketplacePutRequest('http://localhost/api/orders', {
        cancel: true,
        orderId,
        reason: 'Changed mind',
        reasonCode: 'changed_mind',
      }, buyer.id),
    );

    expect(res.status).toBe(200);
    const updated = await prisma.order.findFirst({ where: { orderId } });
    expect(updated?.orderStatus).toBe('Cancelled');
  });

  it('allows distributor owner via dashboard JWT', async () => {
    const distributor = await prisma.user.create({
      data: { email: 'dist-owner@example.com', password: 'x' },
      select: { id: true },
    });
    const orderId = await seedPendingOrder({
      distributorUserId: distributor.id,
      marketplaceBuyerId: null,
    });

    const res = await updateOrderHandler(
      makeAuthenticatedDashboardPutRequest('http://localhost/api/orders', {
        cancel: true,
        orderId,
        reason: 'Seller cancelled',
        reasonCode: 'seller_issues',
      }, distributor.id),
    );

    expect(res.status).toBe(200);
    const updated = await prisma.order.findFirst({ where: { orderId } });
    expect(updated?.orderStatus).toBe('Cancelled');
  });

  it('allows distributor owner when legacy JWT resolves both namespaces on same sub', async () => {
    const distributor = await prisma.user.create({
      data: { email: 'dist-legacy@example.com', password: 'x' },
      select: { id: true },
    });
    const suffix = `legacy_${distributor.id}`;
    await prisma.marketplaceUser.create({
      data: {
        id: distributor.id,
        username: suffix,
        phone: `+6200000${String(distributor.id).padStart(5, '0')}`,
        name: 'Same Id Buyer',
      },
    });
    const orderBuyer = await createMarketplaceBuyer();
    const orderId = await seedPendingOrder({
      distributorUserId: distributor.id,
      marketplaceBuyerId: orderBuyer.id,
    });

    const res = await updateOrderHandler(
      makeAuthenticatedLegacyPutRequest('http://localhost/api/orders', {
        cancel: true,
        orderId,
        reason: 'Owner cancel',
        reasonCode: 'seller_issues',
      }, distributor.id),
    );

    expect(res.status).toBe(200);
    const updated = await prisma.order.findFirst({ where: { orderId } });
    expect(updated?.orderStatus).toBe('Cancelled');
  });

  it('denies marketplace buyer cancelling another buyers order', async () => {
    const distributor = await prisma.user.create({
      data: { email: 'dist-deny@example.com', password: 'x' },
      select: { id: true },
    });
    const orderBuyer = await createMarketplaceBuyer();
    const otherBuyer = await createMarketplaceBuyer();
    const orderId = await seedPendingOrder({
      distributorUserId: distributor.id,
      marketplaceBuyerId: orderBuyer.id,
    });

    const res = await updateOrderHandler(
      makeAuthenticatedMarketplacePutRequest('http://localhost/api/orders', {
        cancel: true,
        orderId,
        reason: 'Not mine',
      }, otherBuyer.id),
    );

    expect(res.status).toBe(403);
  });
});

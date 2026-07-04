import { describe, beforeEach, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { resetDb } from './helpers';
import { buildMobileBuyerId } from '@/utils/buyerSync';
import { ordersResolvers } from '@/app/api/graphql/modules/orders';

const MARKETPLACE_USER_ID = 501;

async function seedOrderForDistributor(distributorUserId: number, orderId: string) {
  const buyerId = buildMobileBuyerId(MARKETPLACE_USER_ID, distributorUserId);

  await prisma.buyer.create({
    data: {
      buyerId,
      owner: 'Shared Buyer',
      email: 'shared-buyer@test.com',
      phone: '0800000000',
      storeName: 'Shared Store',
      businessType: 'Retail',
      address: 'Buyer Address',
      status: 'Active',
      userId: distributorUserId,
    },
  });

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
      contactPerson: 'Shared Buyer',
      storeName: 'Shared Store',
      contactPhone: '0800000000',
      customerEmail: null,
      deliveryAddress: 'Buyer Address',
      userId: distributorUserId,
    },
  });
}

describe('marketplaceOrders resolver - seller scoping (IDOR)', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('only returns orders the buyer placed with the authenticated distributor', async () => {
    const distributorA = await prisma.user.create({
      data: { email: 'dist-a@example.com', password: 'x' },
      select: { id: true },
    });
    const distributorB = await prisma.user.create({
      data: { email: 'dist-b@example.com', password: 'x' },
      select: { id: true },
    });

    // The same marketplace buyer has orders with BOTH distributors.
    await seedOrderForDistributor(distributorA.id, 'LKO-SCOPE-A');
    await seedOrderForDistributor(distributorB.id, 'LKO-SCOPE-B');

    // Distributor A queries the buyer: must only see their own order, never B's PII.
    const resultA = await ordersResolvers.Query.marketplaceOrders(
      undefined,
      { marketplaceUserId: MARKETPLACE_USER_ID, page: 1, limit: 10 },
      { user: { id: distributorA.id, type: 'dashboard' } },
    );

    expect(resultA.pagination.totalCount).toBe(1);
    expect(resultA.nodes).toHaveLength(1);
    expect(resultA.nodes[0].orderId).toBe('LKO-SCOPE-A');
    expect(resultA.nodes.map((n) => n.orderId)).not.toContain('LKO-SCOPE-B');

    // Distributor B sees only their own.
    const resultB = await ordersResolvers.Query.marketplaceOrders(
      undefined,
      { marketplaceUserId: MARKETPLACE_USER_ID, page: 1, limit: 10 },
      { user: { id: distributorB.id, type: 'dashboard' } },
    );
    expect(resultB.pagination.totalCount).toBe(1);
    expect(resultB.nodes[0].orderId).toBe('LKO-SCOPE-B');
  });

  it('rejects unauthenticated and non-dashboard callers', async () => {
    await expect(
      ordersResolvers.Query.marketplaceOrders(
        undefined,
        { marketplaceUserId: MARKETPLACE_USER_ID },
        { user: null },
      ),
    ).rejects.toThrow();

    await expect(
      ordersResolvers.Query.marketplaceOrders(
        undefined,
        { marketplaceUserId: MARKETPLACE_USER_ID },
        { user: { id: 1, type: 'marketplace' } },
      ),
    ).rejects.toThrow();
  });
});

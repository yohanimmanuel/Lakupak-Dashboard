import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { deleteOrderHandler } from '@/services/orders/deleteOrder';
import { makeAuthenticatedDashboardDeleteRequest, resetDb } from './helpers';

describe('orders bulk delete', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('deletes the selected orders in one transaction and cleans related fleet arrays', async () => {
    const distributor = await prisma.user.create({
      data: { email: 'bulk-delete-distributor@example.com', password: 'x' },
      select: { id: true },
    });
    const orderIds = ['LKO-99001', 'LKO-99002'];
    const orderData = orderIds.map((orderId) => ({
      orderId,
      orderDate: new Date(),
      orderStatus: 'Cancelled',
      paymentStatus: 'Unpaid',
      deliveryMethod: 'Seller/Distributor Delivery',
      deliveryOption: null,
      subtotal: 100,
      discounts: 0,
      shippingFee: 0,
      totalAmount: 100,
      paymentTerms: 'Cash on Delivery',
      totalOrders: 1,
      contactPerson: 'Tester',
      storeName: 'Test Store',
      contactPhone: '123',
      customerEmail: null,
      deliveryAddress: 'Addr',
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
    }));
    await prisma.order.createMany({ data: orderData });

    await prisma.fleet.create({
      data: {
        fleetCode: 'FLEET-BULK-DELETE',
        userId: distributor.id,
        route: 'Test route',
        status: 'Available',
        lastUpdate: '2026-11-17',
        assignedOrderIds: [...orderIds, 'LKO-99003'],
        completedOrderIds: [orderIds[1]],
        customers: [
          { orderId: orderIds[0], storeName: 'Store 1', contactName: 'One' },
          { orderId: orderIds[1], storeName: 'Store 2', contactName: 'Two' },
          { orderId: 'LKO-99003', storeName: 'Store 3', contactName: 'Three' },
        ],
      },
    });

    const response = await deleteOrderHandler(
      makeAuthenticatedDashboardDeleteRequest(
        'http://localhost/api/orders',
        { orderIds },
        distributor.id,
      ),
    );

    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.deletedOrderIds).toEqual(orderIds);
    expect(await prisma.order.count({ where: { orderId: { in: orderIds } } })).toBe(0);

    const fleet = await prisma.fleet.findFirst({ where: { fleetCode: 'FLEET-BULK-DELETE' } });
    expect(fleet?.assignedOrderIds).toEqual(['LKO-99003']);
    expect(fleet?.completedOrderIds).toEqual([]);
    expect(fleet?.customers).toEqual([{ orderId: 'LKO-99003', storeName: 'Store 3', contactName: 'Three' }]);
  });

  it('rejects a batch containing an order outside the authenticated owner scope', async () => {
    const owner = await prisma.user.create({ data: { email: 'bulk-delete-owner@example.com', password: 'x' }, select: { id: true } });
    const other = await prisma.user.create({ data: { email: 'bulk-delete-other@example.com', password: 'x' }, select: { id: true } });
    const createOrder = (orderId: string, userId: number) => ({
      orderId, orderDate: new Date(), orderStatus: 'Cancelled', paymentStatus: 'Unpaid',
      deliveryMethod: 'Seller/Distributor Delivery', deliveryOption: null,
      subtotal: 100, discounts: 0, shippingFee: 0, totalAmount: 100,
      paymentTerms: 'Cash on Delivery', totalOrders: 1, contactPerson: 'Tester',
      storeName: 'Test Store', contactPhone: '123', customerEmail: null,
      deliveryAddress: 'Addr', preferredPickupDate: null, preferredPickupTime: null,
      shippingMethodLabel: null, shippingMethod: null, userId, buyerId: null,
      buyerIdSnapshot: null, contactPersonSnapshot: null, contactPhoneSnapshot: null,
      customerEmailSnapshot: null, deliveryAddressSnapshot: null, orderDateSnapshot: null, storeNameSnapshot: null,
    });
    await prisma.order.createMany({ data: [createOrder('LKO-99011', owner.id), createOrder('LKO-99012', other.id)] });

    const response = await deleteOrderHandler(
      makeAuthenticatedDashboardDeleteRequest('http://localhost/api/orders', { orderIds: ['LKO-99011', 'LKO-99012'] }, owner.id),
    );
    expect(response.status).toBe(404);
    expect(await prisma.order.count({ where: { orderId: { in: ['LKO-99011', 'LKO-99012'] } } })).toBe(2);
  });
});

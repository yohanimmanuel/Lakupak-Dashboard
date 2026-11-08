import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  computeOrderMonthOverMonthGrowth,
  computeOrderPeriodGrowth,
  cumulativeCountGrowth,
  formatLegacyTrend,
  growthFromMonthBuckets,
} from '@/utils/monthOverMonthGrowth';
import type { Order } from '@/types/order';

type DatedRecord = { createdAt: string };

function asOrders(orders: unknown[]): Order[] {
  return orders as Order[];
}

describe('monthOverMonthGrowth', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('cumulativeCountGrowth', () => {
    it('returns null when there are no items', () => {
      expect(cumulativeCountGrowth<DatedRecord>([], (item) => item.createdAt)).toBeNull();
    });

    it('returns null when all records were created in the current month only', () => {
      vi.setSystemTime(new Date('2026-06-07T12:00:00Z'));
      const growth = cumulativeCountGrowth(
        [{ createdAt: '2026-06-01' }, { createdAt: '2026-06-05' }],
        (item) => item.createdAt,
      );
      expect(growth).toBeNull();
    });

    it('returns positive growth when this calendar month count exceeds last month', () => {
      vi.setSystemTime(new Date('2026-06-07T12:00:00Z'));
      const growth = cumulativeCountGrowth(
        [
          { createdAt: '2026-05-10' },
          { createdAt: '2026-05-20' },
          { createdAt: '2026-06-01' },
          { createdAt: '2026-06-05' },
          { createdAt: '2026-06-06' },
        ],
        (item) => item.createdAt,
      );
      // May = 2, June = 3 → +50%
      expect(growth).toBeCloseTo(50, 5);
    });

    it('returns null when previous-month baseline is zero', () => {
      vi.setSystemTime(new Date('2026-06-07T12:00:00Z'));
      const growth = cumulativeCountGrowth([{ createdAt: '2026-06-10' }], (item) => item.createdAt);
      expect(growth).toBeNull();
    });
  });

  describe('growthFromMonthBuckets', () => {
    it('returns null when fewer than two months of data exist', () => {
      expect(growthFromMonthBuckets({ '2026-05': 3 })).toBeNull();
    });

    it('computes month-over-month percent change', () => {
      expect(growthFromMonthBuckets({ '2026-04': 4, '2026-05': 6 })).toBeCloseTo(50, 5);
    });
  });

  describe('formatLegacyTrend', () => {
    it('maps null growth to N/A', () => {
      expect(formatLegacyTrend(null)).toEqual({
        percent: 'N/A',
        label: '(last month)',
        up: true,
      });
    });

    it('maps zero growth to neutral 0.0%', () => {
      expect(formatLegacyTrend(0).percent).toBe('0.0%');
    });
  });

  describe('computeOrderMonthOverMonthGrowth', () => {
    it('returns null growth fields when the previous calendar month has no orders', () => {
      vi.setSystemTime(new Date('2026-06-07T12:00:00Z'));
      const orders = asOrders([
        {
          orderDate: new Date('2026-06-10'),
          orderStatus: 'Delivered',
          shippingFee: 0,
          discounts: 0,
          orderItems: [{ packageQuantity: 1, piecesPerPackage: 2, pricePerPackage: 0, subtotal: 0 }],
        },
      ]);

      const growth = computeOrderMonthOverMonthGrowth(orders);
      expect(growth.ordersGrowth).toBeNull();
      expect(growth.ordersCurrent).toBe(1);
      expect(growth.ordersPrevious).toBe(0);
      expect(growth.orderVolumeGrowth).toBeNull();
      expect(growth.piecesGrowth).toBeNull();
      expect(growth.piecesCurrent).toBe(2);
      expect(growth.completionCurrent).toBe(100);
      expect(growth.completionGrowth).toBeNull();
    });

    it('computes order count growth for this calendar month vs last month', () => {
      vi.setSystemTime(new Date('2026-05-28T12:00:00Z'));
      const orders = asOrders([
        { orderDate: new Date('2026-04-05'), orderStatus: 'Delivered', totalAmount: 100, orderItems: [] },
        { orderDate: new Date('2026-04-20'), orderStatus: 'Delivered', totalAmount: 100, orderItems: [] },
        { orderDate: new Date('2026-05-05'), orderStatus: 'Delivered', totalAmount: 100, orderItems: [] },
        { orderDate: new Date('2026-05-20'), orderStatus: 'Delivered', totalAmount: 100, orderItems: [] },
        { orderDate: new Date('2026-05-25'), orderStatus: 'Delivered', totalAmount: 100, orderItems: [] },
      ]);

      const growth = computeOrderMonthOverMonthGrowth(orders);
      // April = 2, May = 3 → +50%
      expect(growth.ordersGrowth).toBeCloseTo(50, 5);
      expect(growth.ordersCurrent).toBe(3);
      expect(growth.ordersPrevious).toBe(2);
    });
  });

  describe('computeOrderPeriodGrowth', () => {
    it('compares equal-length windows for the selected range', () => {
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
      // 3M current = [Mar 15, Jun 15], previous = [Dec 15, Mar 14]
      const orders = asOrders([
        { orderDate: new Date('2026-01-10'), orderStatus: 'Delivered', totalAmount: 100, orderItems: [] },
        { orderDate: new Date('2026-02-10'), orderStatus: 'Delivered', totalAmount: 100, orderItems: [] },
        { orderDate: new Date('2026-04-05'), orderStatus: 'Delivered', totalAmount: 100, orderItems: [] },
        { orderDate: new Date('2026-05-05'), orderStatus: 'Delivered', totalAmount: 100, orderItems: [] },
        { orderDate: new Date('2026-06-05'), orderStatus: 'Delivered', totalAmount: 100, orderItems: [] },
      ]);

      const growth = computeOrderPeriodGrowth(orders, '3M');
      expect(growth.ordersGrowth).toBeCloseTo(50, 5);
    });
  });
});

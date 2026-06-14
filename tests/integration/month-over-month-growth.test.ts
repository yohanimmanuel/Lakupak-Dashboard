import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  computeOrderMonthOverMonthGrowth,
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

    it('returns positive growth when cumulative count increased through last month', () => {
      vi.setSystemTime(new Date('2026-06-07T12:00:00Z'));
      const growth = cumulativeCountGrowth(
        [
          { createdAt: '2026-01-15' },
          { createdAt: '2026-01-20' },
          { createdAt: '2026-05-10' },
        ],
        (item) => item.createdAt,
      );
      expect(growth).toBeCloseTo(50, 5);
    });

    it('returns null when previous-month baseline is zero', () => {
      vi.setSystemTime(new Date('2026-06-07T12:00:00Z'));
      const growth = cumulativeCountGrowth([{ createdAt: '2026-05-10' }], (item) => item.createdAt);
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
        label: 'vs last month',
        up: true,
      });
    });

    it('maps zero growth to neutral 0.0%', () => {
      expect(formatLegacyTrend(0).percent).toBe('0.0%');
    });
  });

  describe('computeOrderMonthOverMonthGrowth', () => {
    it('returns null growth fields when fewer than two order months exist', () => {
      const orders = asOrders([
        {
          orderDate: new Date('2026-05-10'),
          orderStatus: 'Delivered',
          orderItems: [{ packageQuantity: 1, piecesPerPackage: 2 }],
        },
      ]);

      expect(computeOrderMonthOverMonthGrowth(orders)).toEqual({
        ordersGrowth: null,
        orderVolumeGrowth: null,
        completionGrowth: null,
        averageOrderVolumeGrowth: null,
        piecesGrowth: null,
      });
    });

    it('computes order count growth across the last two active months', () => {
      const orders = asOrders([
        { orderDate: new Date('2026-04-05'), orderStatus: 'Delivered', totalAmount: 100, orderItems: [] },
        { orderDate: new Date('2026-04-20'), orderStatus: 'Delivered', totalAmount: 100, orderItems: [] },
        { orderDate: new Date('2026-05-05'), orderStatus: 'Delivered', totalAmount: 100, orderItems: [] },
        { orderDate: new Date('2026-05-20'), orderStatus: 'Delivered', totalAmount: 100, orderItems: [] },
        { orderDate: new Date('2026-05-25'), orderStatus: 'Delivered', totalAmount: 100, orderItems: [] },
      ]);

      const growth = computeOrderMonthOverMonthGrowth(orders);
      expect(growth.ordersGrowth).toBeCloseTo(50, 5);
    });
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildBuyerRecordCreateManyRows,
  parseOrderDetailsJson,
  areBuyerOrderDetailsEqual,
} from '@/lib/clients/buyerRecords';

describe('empty buyer order records', () => {
  it('accepts an explicit empty array as zero buyer records', () => {
    expect(parseOrderDetailsJson('[]')).toEqual([]);
    expect(buildBuyerRecordCreateManyRows(1, '[]')).toEqual([]);
  });

  it('allows replacing existing buyer order rows with none', () => {
    const existing = [{ orderNo: 'OLD-1', product: 'Example', totalOrders: '1', totalSpend: '100', outstanding: '0', lastOrderDate: '' }];
    expect(areBuyerOrderDetailsEqual(existing, [])).toBe(false);
    expect(areBuyerOrderDetailsEqual([], [])).toBe(true);
  });
});

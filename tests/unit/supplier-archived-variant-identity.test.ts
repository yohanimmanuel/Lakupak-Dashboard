import { describe, expect, it } from 'vitest';
import type { SupplyDetail } from '@/types/client';
import { applySummaryDelta, buildSupplySummaryFromHistory, mergeDuplicateSummaryRows, serializeHistorySupplyForStorage } from '@/lib/suppliers/supplyRecords';

const row = (variantOptionId: number, recordType: 'history' | 'summary'): SupplyDetail => ({
  suppliesno: `${recordType === 'history' ? 'HIST' : 'AUTO'}-P-1|variant:${variantOptionId}`,
  productId: 'P-1', variantOptionId, variantName: 'Original', sku: 'REUSED-SKU',
  product: 'Original', totalSupplied: '10', totalValue: '100',
  recordType, status: 'Active', stockApplied: false,
});

describe('archived supplier variant identity', () => {
  it('preserves live, historical, and applied variant IDs when serializing a receipt', () => {
    const serialized = serializeHistorySupplyForStorage({
      ...row(205, 'history'),
      historicalVariantOptionId: 101,
      stockAppliedVariantOptionId: 99,
      updateCurrentStock: true,
      stockApplied: true,
    });

    expect(serialized).toMatchObject({
      variantOptionId: 205,
      historicalVariantOptionId: 101,
      stockAppliedVariantOptionId: 99,
      updateCurrentStock: true,
      stockApplied: true,
    });
  });
  it('keeps deleted and recreated variants separate despite matching SKU and label', () => {
    const rows = mergeDuplicateSummaryRows([row(1, 'summary'), row(2, 'summary')]);
    expect(rows).toHaveLength(2);
  });
  it('never applies a receipt delta from an archived variant to the recreated variant', () => {
    const rows = applySummaryDelta([row(2, 'summary')], {
      productId: 'P-1', variantOptionId: 1, variantName: 'Original',
      sku: 'REUSED-SKU', product: 'Original', quantity: 5, totalValue: 50,
    });
    expect(rows).toHaveLength(2);
    expect(rows.find(r => r.variantOptionId === 2)?.totalSupplied).toBe('10');
  });
  it('does not merge archived receipt history into a recreated stock snapshot', () => {
    const rows = buildSupplySummaryFromHistory([row(1, 'history')], [row(2, 'summary')]);
    expect(rows).toHaveLength(2);
    expect(rows.find(r => r.variantOptionId === 2)?.totalSupplied).toBe('10');
  });
});

import { describe, expect, it } from 'vitest';
import type { SupplyDetail } from '@/types/client';
import { buildSupplySummaryFromHistory } from '@/lib/suppliers/supplyRecords';

function history(overrides: Partial<SupplyDetail> = {}): SupplyDetail {
  return {
    suppliesno: 'HIST-1',
    sku: 'SKU-1',
    product: 'Widget (BBQ)',
    totalSupplied: '256',
    totalValue: '51200',
    lastSuppliedDate: '2026-11-17',
    status: 'Active',
    recordType: 'history',
    productId: 'P-1',
    variantOptionId: 42,
    variantName: 'BBQ',
    updateCurrentStock: false,
    stockApplied: false,
    ...overrides,
  };
}

function autoSnapshot(totalSupplied: string, totalValue: string): SupplyDetail {
  return {
    suppliesno: 'AUTO-P-1|variant:42',
    sku: 'SKU-1',
    product: 'Widget (BBQ)',
    totalSupplied,
    totalValue,
    lastSuppliedDate: '',
    status: 'Active',
    recordType: 'summary',
    productId: 'P-1',
    variantOptionId: 42,
    variantName: 'BBQ',
  };
}

describe('supplier summary stays stable when Product stock is toggled', () => {
  it('preserves 12,519 pieces when the 256-piece receipt is included in Product stock', () => {
    const summary = buildSupplySummaryFromHistory(
      [history({ updateCurrentStock: true, stockApplied: true })],
      [autoSnapshot('12519', '900000')],
    );

    expect(summary).toHaveLength(1);
    expect(summary[0].totalSupplied).toBe('12519');
    expect(summary[0].totalValue).toBe('900000');
  });

  it('preserves 12,519 pieces when the same 256-piece receipt is reversed from Product stock', () => {
    const summary = buildSupplySummaryFromHistory(
      [history({ updateCurrentStock: false, stockApplied: false })],
      [autoSnapshot('12263', '848800')],
    );

    expect(summary).toHaveLength(1);
    expect(summary[0].totalSupplied).toBe('12519');
    expect(summary[0].totalValue).toBe('900000');
  });

  it('counts a checked receipt when the stock update did not actually succeed', () => {
    const summary = buildSupplySummaryFromHistory(
      [history({ totalSupplied: '40', updateCurrentStock: true, stockApplied: false })],
      [autoSnapshot('300', '20000')],
    );

    expect(summary[0].totalSupplied).toBe('340');
    expect(summary[0].totalValue).toBe('71200');
  });

  it('uses VariantOption ID as identity even when SKU and variant labels differ', () => {
    const summary = buildSupplySummaryFromHistory(
      [history({ sku: 'OLD-SKU', variantName: 'Old BBQ label', product: 'Old imported product label' })],
      [autoSnapshot('12263', '848800')],
    );

    expect(summary).toHaveLength(1);
    expect(summary[0].variantOptionId).toBe(42);
    expect(summary[0].totalSupplied).toBe('12519');
  });
});

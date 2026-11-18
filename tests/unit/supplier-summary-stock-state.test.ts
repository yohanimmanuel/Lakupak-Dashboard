import { describe, expect, it } from 'vitest';
import { buildSupplySummaryFromHistory } from '@/lib/suppliers/supplyRecords';
import type { SupplyDetail } from '@/types/client';

const snapshot = (quantity: number): SupplyDetail => ({
  suppliesno: 'AUTO-product-variant', sku: 'SKU-30-BBQ', product: 'Potato Chips',
  productId: 'PRODUCT-1', variantName: 'BBQ', totalSupplied: String(quantity),
  totalValue: '54845102', recordType: 'summary', status: 'Active', lastSuppliedDate: '',
});
const receipt = (overrides: Partial<SupplyDetail> = {}): SupplyDetail => ({
  suppliesno: 'HIST-256', sku: 'SKU-30-BBQ', product: 'Potato Chips',
  productId: 'PRODUCT-1', variantName: 'BBQ', totalSupplied: '256', totalValue: '0',
  recordType: 'history', status: 'Active', lastSuppliedDate: '2026-11-17',
  updateCurrentStock: true, stockApplied: true, ...overrides,
});

describe('supplier totals stay stable across stock checkbox state', () => {
  it('uses the synchronized Product snapshot when the receipt has been applied', () => {
    const [summary] = buildSupplySummaryFromHistory([receipt()], [snapshot(12519)]);
    expect(Number(summary.totalSupplied)).toBe(12519);
  });

  it('adds the receipt to the reduced Product snapshot after stock is reversed', () => {
    const [summary] = buildSupplySummaryFromHistory(
      [receipt({ updateCurrentStock: false, stockApplied: false })],
      [snapshot(12263)],
    );
    expect(Number(summary.totalSupplied)).toBe(12519);
  });

  it('does not double-count a checked receipt after AUTO snapshots are synchronized', () => {
    const [summary] = buildSupplySummaryFromHistory(
      [receipt({ updateCurrentStock: true, stockApplied: true })],
      [snapshot(12519)],
    );
    expect(Number(summary.totalSupplied)).toBe(12519);
  });
});

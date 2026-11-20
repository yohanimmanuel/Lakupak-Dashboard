import { describe, expect, it } from 'vitest';
import type { SupplyDetail } from '@/types/client';
import { serializeHistorySupplyForStorage, getSupplyRecordType } from '@/lib/suppliers/supplyRecords';

const receipt = (variantOptionId: number): SupplyDetail => ({
  suppliesno: `HIST-P-1|variant:${variantOptionId}`,
  productId: 'P-1',
  variantOptionId,
  variantName: 'Original',
  sku: 'REUSED-SKU',
  product: 'Original',
  totalSupplied: '10',
  totalValue: '100',
  recordType: 'history',
  status: 'Active',
  stockApplied: false,
});

describe('supplier receipt variant identity', () => {
  it('preserves live, historical, and applied variant IDs when serializing', () => {
    const serialized = serializeHistorySupplyForStorage({
      ...receipt(205),
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

  it('preserves distinct receipt identities for recreated variants with the same SKU', () => {
    const oldReceipt = serializeHistorySupplyForStorage({
      ...receipt(1),
      historicalVariantOptionId: 1,
    });
    const replacementReceipt = serializeHistorySupplyForStorage({
      ...receipt(2),
      historicalVariantOptionId: 2,
    });
    expect(oldReceipt.historicalVariantOptionId).toBe(1);
    expect(replacementReceipt.historicalVariantOptionId).toBe(2);
    expect(oldReceipt.variantOptionId).not.toBe(replacementReceipt.variantOptionId);
    expect(oldReceipt.sku).toBe(replacementReceipt.sku);
  });

  it('continues to identify legacy AUTO snapshots without treating them as receipts', () => {
    expect(getSupplyRecordType({ suppliesno: 'AUTO-P-1', recordType: 'history' })).toBe('summary');
  });
});

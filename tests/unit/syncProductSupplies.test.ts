import { describe, expect, it } from 'vitest';
import type { SupplyDetail } from '@/types/client';
import {
  belongsToProduct,
  removeProductVariantsFromSupplierMaps,
  supplyAutoNo,
  syncAllProductSuppliersForUser,
} from '@/lib/suppliers/syncProductSupplies';

const receipt = (suppliesno: string, productId = 'P-1'): SupplyDetail => ({
  suppliesno,
  productId,
  sku: 'REUSED-SKU',
  product: 'Widget',
  totalSupplied: '40',
  totalValue: '200000',
  lastSuppliedDate: '2026-11-20',
  status: 'Active',
  recordType: 'history',
});

describe('receipt-only catalog synchronization', () => {
  it('does not backfill catalog stock as supplier opening balances', async () => {
    await expect(syncAllProductSuppliersForUser(9)).resolves.toEqual({
      productsProcessed: 0,
      suppliersTouched: 0,
    });
  });

  it('preserves all receipt history when a catalog variant is deleted', () => {
    const old = receipt('HIST-OLD');
    const replacement = receipt('HIST-REPLACEMENT');
    const supplies = new Map<number, SupplyDetail[]>([[1, [old, replacement]]]);
    const dirty = new Set<number>();
    removeProductVariantsFromSupplierMaps(
      { productId: 'P-1', name: 'Widget' },
      [{ variantName: 'Old', sku: 'REUSED-SKU' }],
      [{ variantName: 'Old', sku: 'REUSED-SKU' }, { variantName: 'New', sku: 'REUSED-SKU' }],
      supplies,
      [{ id: 1, name: 'Supplier A' }],
      dirty,
    );
    expect(supplies.get(1)).toEqual([old, replacement]);
    expect(dirty.size).toBe(0);
  });

  it('retains legacy AUTO identifiers only for compatibility', () => {
    expect(supplyAutoNo('P-1', 'Default')).toBe('AUTO-P-1|Default');
    expect(belongsToProduct(receipt('HIST-1'), { productId: 'P-1' })).toBe(true);
    expect(belongsToProduct(receipt('HIST-2', 'P-2'), { productId: 'P-1' })).toBe(false);
  });
});

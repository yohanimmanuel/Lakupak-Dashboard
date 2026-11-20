import { describe, expect, it } from 'vitest';
import type { SupplyDetail } from '@/types/client';
import {
  applyProductToSupplierMaps,
  belongsToProduct,
  removeProductVariantsFromSupplierMaps,
  supplyAutoNo,
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
  it('never creates AUTO summaries or moves historical receipts on supplier reassignment', () => {
    const original = receipt('HIST-1');
    const supplies = new Map<number, SupplyDetail[]>([[1, [original]], [2, []]]);
    const dirty = new Set<number>();
    applyProductToSupplierMaps(
      {
        productId: 'P-1',
        name: 'Widget',
        supplier: 'Supplier B',
        userId: 9,
        variantOptions: [{ variantName: 'Default', sku: 'REUSED-SKU', purchasePrice: 100, stockQuantity: 100 }],
      },
      supplies,
      [{ id: 1, name: 'Supplier A' }, { id: 2, name: 'Supplier B' }],
      dirty,
    );
    expect(dirty.size).toBe(0);
    expect(supplies.get(1)).toEqual([original]);
    expect(supplies.get(2)).toEqual([]);
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

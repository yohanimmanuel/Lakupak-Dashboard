import { describe, expect, it } from 'vitest';
import type { SupplyDetail } from '@/types/client';
import {
  applyProductToSupplierMaps,
  belongsToProduct,
  removeProductFromSupplierMaps,
  supplyAutoNo,
} from '@/lib/suppliers/syncProductSupplies';

function summaryRow(productId: string, variantName = 'Default', overrides: Partial<SupplyDetail> = {}): SupplyDetail {
  return {
    suppliesno: supplyAutoNo(productId, variantName),
    sku: `${productId}|${variantName}`,
    product: `Widget (${variantName})`,
    totalSupplied: '100',
    totalValue: '500000',
    lastDelivery: '',
    status: 'Active',
    recordType: 'summary',
    productId,
    variantName,
    ...overrides,
  };
}

function historyRow(productId: string, overrides: Partial<SupplyDetail> = {}): SupplyDetail {
  return {
    suppliesno: `HIST-${productId}-1`,
    sku: 'SKU-WIDGET',
    product: 'Widget (Default)',
    totalSupplied: '40',
    totalValue: '200000',
    lastDelivery: '2026-01-15',
    status: 'Active',
    recordType: 'history',
    productId,
    variantName: 'Default',
    ...overrides,
  };
}

describe('syncProductSupplies reassignment', () => {
  it('belongsToProduct matches summary and history rows for the product', () => {
    const product = { productId: 'P-1' };
    expect(belongsToProduct(summaryRow('P-1'), product)).toBe(true);
    expect(belongsToProduct(historyRow('P-1'), product)).toBe(true);
    expect(belongsToProduct(historyRow('P-OTHER'), product)).toBe(false);
    expect(
      belongsToProduct(
        {
          suppliesno: 'HIST-x',
          sku: 'unrelated',
          product: 'Other',
          totalSupplied: '1',
          totalValue: '1',
          lastDelivery: '2026-01-01',
          status: 'Active',
          recordType: 'history',
        },
        product,
      ),
    ).toBe(false);
    // Hint SKU must not claim a row that already belongs to another productId.
    expect(
      belongsToProduct(
        historyRow('P-OTHER', { sku: 'SKU-SHARED' }),
        product,
        { skus: ['SKU-SHARED'], labels: ['Widget (Default)'] },
      ),
    ).toBe(false);
  });

  it('moves summary and history from supplier A to supplier B when product supplier changes', () => {
    const productId = 'P-MOVE-1';
    const summary = summaryRow(productId);
    const historyA = historyRow(productId, { suppliesno: 'HIST-A', lastDelivery: '2026-02-01' });
    const historyB = historyRow(productId, { suppliesno: 'HIST-B', lastDelivery: '2026-03-01', totalSupplied: '10' });
    const unrelated = historyRow('P-OTHER', { suppliesno: 'HIST-OTHER', product: 'Other product' });

    const suppliesBySupplierId = new Map<number, SupplyDetail[]>([
      [1, [summary, historyA, historyB, unrelated]],
      [2, []],
    ]);
    const suppliers = [
      { id: 1, name: 'Supplier A' },
      { id: 2, name: 'Supplier B' },
    ];
    const dirty = new Set<number>();

    applyProductToSupplierMaps(
      {
        productId,
        name: 'Widget',
        supplier: 'Supplier B',
        userId: 9,
        variantOptions: [
          {
            variantName: 'Default',
            sku: 'SKU-WIDGET',
            purchasePrice: '5000',
            stockQuantity: 100,
            isActive: true,
          },
        ],
      },
      suppliesBySupplierId,
      suppliers,
      dirty,
    );

    expect(dirty.has(1)).toBe(true);
    expect(dirty.has(2)).toBe(true);

    const leftOnA = suppliesBySupplierId.get(1) || [];
    const onB = suppliesBySupplierId.get(2) || [];

    expect(leftOnA).toHaveLength(1);
    expect(leftOnA[0].suppliesno).toBe('HIST-OTHER');

    const summaryOnB = onB.filter((r) => r.recordType === 'summary');
    const historyOnB = onB.filter((r) => r.recordType === 'history');
    expect(summaryOnB).toHaveLength(1);
    expect(summaryOnB[0].totalSupplied).toBe('100');
    expect(summaryOnB[0].totalValue).toBe('500000');
    expect(historyOnB.map((r) => r.suppliesno).sort()).toEqual(['HIST-A', 'HIST-B']);
  });

  it('does not collapse distinct history rows that share the same product label', () => {
    const productId = 'P-MOVE-2';
    const suppliesBySupplierId = new Map<number, SupplyDetail[]>([
      [
        1,
        [
          historyRow(productId, { suppliesno: 'HIST-1', lastDelivery: '2026-01-01' }),
          historyRow(productId, { suppliesno: 'HIST-2', lastDelivery: '2026-02-01', totalSupplied: '5' }),
        ],
      ],
      [2, []],
    ]);
    const dirty = new Set<number>();

    applyProductToSupplierMaps(
      {
        productId,
        name: 'Widget',
        supplier: 'Supplier B',
        userId: 9,
        variantOptions: [{ variantName: 'Default', purchasePrice: '1', stockQuantity: 0, isActive: true }],
      },
      suppliesBySupplierId,
      [
        { id: 1, name: 'Supplier A' },
        { id: 2, name: 'Supplier B' },
      ],
      dirty,
    );

    const historyOnB = (suppliesBySupplierId.get(2) || []).filter((r) => r.recordType === 'history');
    expect(historyOnB).toHaveLength(2);
  });

  it('does not reuse another variant summary when matching by productId alone would collide', () => {
    const productId = 'P-MULTI';
    const largeSummary = summaryRow(productId, 'Large', {
      suppliesno: 'LEGACY-NO-AUTO',
      totalSupplied: '250',
      totalValue: '1250000',
    });
    const suppliesBySupplierId = new Map<number, SupplyDetail[]>([[1, [largeSummary]]]);
    const dirty = new Set<number>();

    applyProductToSupplierMaps(
      {
        productId,
        name: 'Widget',
        supplier: 'Supplier A',
        userId: 9,
        variantOptions: [
          { variantName: 'Large', sku: 'SKU-L', purchasePrice: '5000', stockQuantity: 250, isActive: true },
          { variantName: 'Small', sku: 'SKU-S', purchasePrice: '1000', stockQuantity: 10, isActive: true },
        ],
      },
      suppliesBySupplierId,
      [{ id: 1, name: 'Supplier A' }],
      dirty,
    );

    const summaries = (suppliesBySupplierId.get(1) || []).filter((r) => r.recordType === 'summary');
    expect(summaries).toHaveLength(2);
    expect(summaries.find((r) => r.variantName === 'Large')?.totalSupplied).toBe('250');
    expect(summaries.find((r) => r.variantName === 'Small')).toBeTruthy();
  });

  it('removes linked summary and history when supplier match is cleared', () => {
    const productId = 'P-CLEAR-1';
    const suppliesBySupplierId = new Map<number, SupplyDetail[]>([
      [1, [summaryRow(productId), historyRow(productId), historyRow('P-KEEP', { suppliesno: 'HIST-KEEP' })]],
    ]);
    const dirty = new Set<number>();

    applyProductToSupplierMaps(
      {
        productId,
        name: 'Widget',
        supplier: '',
        userId: 9,
        variantOptions: [{ variantName: 'Default', purchasePrice: '1', stockQuantity: 1, isActive: true }],
      },
      suppliesBySupplierId,
      [{ id: 1, name: 'Supplier A' }],
      dirty,
    );

    const left = suppliesBySupplierId.get(1) || [];
    expect(left).toHaveLength(1);
    expect(left[0].suppliesno).toBe('HIST-KEEP');
  });

  it('removes linked summary and history from every supplier when a product is deleted', () => {
    const productId = 'P-DEL-1';
    const suppliesBySupplierId = new Map<number, SupplyDetail[]>([
      [1, [summaryRow(productId), historyRow(productId, { suppliesno: 'HIST-A' })]],
      [2, [historyRow(productId, { suppliesno: 'HIST-B' }), historyRow('P-KEEP', { suppliesno: 'HIST-KEEP' })]],
    ]);
    const dirty = new Set<number>();

    removeProductFromSupplierMaps(
      { productId },
      suppliesBySupplierId,
      [
        { id: 1, name: 'Supplier A' },
        { id: 2, name: 'Supplier B' },
      ],
      dirty,
    );

    expect(dirty.has(1)).toBe(true);
    expect(dirty.has(2)).toBe(true);
    expect(suppliesBySupplierId.get(1) || []).toEqual([]);
    expect((suppliesBySupplierId.get(2) || []).map((r) => r.suppliesno)).toEqual(['HIST-KEEP']);
  });

  it('removes catalog-SKU summary rows via delete match hints even without productId on the row', () => {
    const productId = 'P-DEL-SKU';
    const orphan: SupplyDetail = {
      suppliesno: '',
      sku: 'SKU-1296525',
      product: 'awda (awd: awd)',
      totalSupplied: '1',
      totalValue: '7000',
      lastDelivery: '',
      status: 'Active',
      recordType: 'summary',
    };
    const keep = historyRow('P-KEEP', { suppliesno: 'HIST-KEEP' });
    const suppliesBySupplierId = new Map<number, SupplyDetail[]>([[1, [orphan, keep]]]);
    const dirty = new Set<number>();

    removeProductFromSupplierMaps(
      { productId },
      suppliesBySupplierId,
      [{ id: 1, name: 'Heinz ABC' }],
      dirty,
      { skus: ['SKU-1296525'], labels: ['awda (awd: awd)'] },
    );

    expect((suppliesBySupplierId.get(1) || []).map((r) => r.suppliesno)).toEqual(['HIST-KEEP']);
  });
});

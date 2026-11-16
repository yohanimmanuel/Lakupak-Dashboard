import { describe, expect, it } from 'vitest';
import type { SupplyDetail } from '@/types/client';
import { buildSupplySummaryFromHistory } from '@/lib/suppliers/supplyRecords';
import { getSupplySummaryQuantities } from '@/lib/suppliers/supplyPackageUnits';

const stockLevels = [
  { name: 'Pieces', piecesPerUnit: 1 },
  { name: 'Cartons', piecesPerUnit: 120, unitsPerPreviousLevel: 120 },
  { name: 'Boxes', piecesPerUnit: 1200, unitsPerPreviousLevel: 10 },
];

function history(overrides: Partial<SupplyDetail> = {}): SupplyDetail {
  return {
    suppliesno: 'HIST-1',
    sku: 'SKU-1',
    product: 'Widget (BBQ)',
    totalSupplied: '240',
    receivedQuantity: '2',
    receivedUnit: 'Cartons',
    totalValue: '20000',
    lastSuppliedDate: '2026-11-15',
    status: 'Active',
    recordType: 'history',
    productId: 'P-1',
    variantName: 'BBQ',
    ...overrides,
  };
}

describe('supplier supply summary', () => {
  it('preserves product-linked opening balances and does not double-count their receipt history', () => {
    const rows = buildSupplySummaryFromHistory(
      [
        history(),
        history({ suppliesno: 'HIST-2', totalSupplied: '10', receivedQuantity: '10', receivedUnit: 'Pieces', totalValue: '500' }),
        history({ productId: 'P-2', variantName: 'Oreo', sku: 'SKU-2', product: 'Widget (Oreo)', totalSupplied: '100' }),
      ],
      [
        {
          // Opening 1,000 Pieces + 240 + 10 Pieces already applied by the save logic.
          ...history({ suppliesno: 'AUTO-P-1|BBQ', totalSupplied: '1250', totalValue: '8821500' }),
          recordType: 'summary',
        },
        {
          // Opening stock remains visible even when there is no receipt history.
          ...history({ suppliesno: 'AUTO-P-1|Oreo', product: 'Widget (Oreo)', variantName: 'Oreo', totalSupplied: '5000', totalValue: '777777' }),
          recordType: 'summary',
        },
      ],
    );

    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.productId === 'P-1' && row.variantName === 'BBQ')?.totalSupplied).toBe('1250');
    expect(rows.find((row) => row.productId === 'P-1' && row.variantName === 'BBQ')?.totalValue).toBe('8821500');
    expect(rows.find((row) => row.productId === 'P-1' && row.variantName === 'Oreo')?.totalSupplied).toBe('5000');
    expect(rows.find((row) => row.productId === 'P-1' && row.variantName === 'Oreo')?.totalValue).toBe('777777');
    // History without a linked summary is still aggregated from the history records.
    expect(rows.find((row) => row.productId === 'P-2')?.totalSupplied).toBe('100');
  });

  it('uses the persisted linked summary total as authoritative when receipts are also present in history', () => {
    const rows = buildSupplySummaryFromHistory(
      [history({ totalSupplied: '480', totalValue: '20000000' })],
      [
        {
          ...history({ suppliesno: 'AUTO-P-1|BBQ', totalSupplied: '1480', totalValue: '28800000' }),
          recordType: 'summary',
        },
      ],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].totalSupplied).toBe('1480');
    expect(rows[0].totalValue).toBe('28800000');
  });

  it('does not merge legacy variants that share a SKU but have different product labels', () => {
    const rows = buildSupplySummaryFromHistory([
      history({ productId: undefined, variantName: undefined, product: 'Peperro snacks (Size: 40/Box | Flavor: Pistachio)', totalSupplied: '1000' }),
      history({ suppliesno: 'HIST-2', productId: undefined, variantName: undefined, product: 'Peperro snacks (Size: 20/Box | Flavor: BBQ)', totalSupplied: '1480' }),
      history({ suppliesno: 'HIST-3', productId: undefined, variantName: undefined, product: 'Peperro snacks (Size: 40/Box | Flavor: Pistachio)', totalSupplied: '1000' }),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.product.includes('Pistachio'))?.totalSupplied).toBe('2000');
    expect(rows.find((row) => row.product.includes('BBQ'))?.totalSupplied).toBe('1480');
  });

  it('expresses received totals in each configured stock level using supplier quantities, not product stock', () => {
    const quantities = getSupplySummaryQuantities('1480', stockLevels);
    expect(quantities).toEqual([
      { name: 'Pieces', availableQuantity: '1,480', equivalentQuantity: '1,480', piecesPerUnit: 1 },
      { name: 'Cartons', availableQuantity: '12', equivalentQuantity: '12.3333', piecesPerUnit: 120 },
      { name: 'Boxes', availableQuantity: '1', equivalentQuantity: '1.2333', piecesPerUnit: 1200 },
    ]);
  });

  it('falls back to Pieces when a product has no configured package levels', () => {
    expect(getSupplySummaryQuantities('25', null)).toEqual([
      { name: 'Pieces', availableQuantity: '25', equivalentQuantity: '25', piecesPerUnit: 1 },
    ]);
  });
});

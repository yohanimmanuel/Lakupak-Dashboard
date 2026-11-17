import { describe, expect, it } from 'vitest';
import type { SupplyDetail } from '@/types/client';
import { buildSupplySummaryFromHistory, getSupplyReceivedInput, getSupplyRecordType, mergeDuplicateSummaryRows } from '@/lib/suppliers/supplyRecords';
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
  it('uses AUTO/HIST IDs as the canonical record-type discriminator for legacy rows', () => {
    expect(getSupplyRecordType({ suppliesno: 'AUTO-P-1|BBQ', recordType: 'history' } as SupplyDetail)).toBe('summary');
    expect(getSupplyRecordType({ suppliesno: 'HIST-123', recordType: 'summary' } as SupplyDetail)).toBe('history');
  });

  it('adds only non-stock-applied history to the current product variant stock snapshot', () => {
    const rows = buildSupplySummaryFromHistory(
      [
        history({ totalSupplied: '240', totalValue: '20000', stockApplied: true, updateCurrentStock: true }),
        history({ suppliesno: 'HIST-2', totalSupplied: '30', totalValue: '3000', stockApplied: false, updateCurrentStock: false }),
      ],
      [
        { ...history({ suppliesno: 'AUTO-P-1|BBQ', totalSupplied: '500', totalValue: '2500000' }), recordType: 'summary' },
      ],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].totalSupplied).toBe('530');
    expect(rows[0].totalValue).toBe('2503000');
  });

  it('includes a checked receipt when the stock application explicitly failed', () => {
    const rows = buildSupplySummaryFromHistory(
      [history({ totalSupplied: '40', updateCurrentStock: true, stockApplied: false })],
      [{ ...history({ suppliesno: 'AUTO-P-1|BBQ', totalSupplied: '300' }), recordType: 'summary' }],
    );
    expect(rows[0].totalSupplied).toBe('340');
  });

  it('does not add stock-applied receipt history to a product stock snapshot a second time', () => {
    const rows = buildSupplySummaryFromHistory(
      [history({ totalSupplied: '240', stockApplied: true, updateCurrentStock: true })],
      [{ ...history({ suppliesno: 'AUTO-P-1|BBQ', totalSupplied: '740' }), recordType: 'summary' }],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].totalSupplied).toBe('740');
  });

  it('keeps a product stock snapshot stable when duplicate AUTO rows exist', () => {
    const rows = buildSupplySummaryFromHistory(
      [],
      [
        { ...history({ suppliesno: 'AUTO-1', totalSupplied: '500', totalValue: '250000' }), recordType: 'summary' },
        { ...history({ suppliesno: 'AUTO-2', totalSupplied: '500', totalValue: '250000' }), recordType: 'summary' },
      ],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].totalSupplied).toBe('500');
    expect(rows[0].totalValue).toBe('250000');
  });

  it('matches a distributor-specific history label to a unique catalog SKU', () => {
    const rows = buildSupplySummaryFromHistory(
      [history({ productId: undefined, variantName: undefined, product: 'Accurate legacy item label', totalSupplied: '25' })],
      [{ ...history({ suppliesno: 'AUTO-P-1|BBQ', product: 'Lakupak catalog label', totalSupplied: '300' }), recordType: 'summary' }],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].totalSupplied).toBe('325');
    expect(rows[0].product).toBe('Widget (BBQ)');
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


  it('merges linked summaries by the same product ID and SKU even when stored labels differ', () => {
    const rows = mergeDuplicateSummaryRows([
      history({ suppliesno: 'AUTO-A', recordType: 'summary', productId: 'P-LINKED', sku: 'SKU-ONE', variantName: 'Old label', product: 'Imported distributor label', totalSupplied: '70', totalValue: '700' }),
      history({ suppliesno: 'AUTO-B', recordType: 'summary', productId: 'P-LINKED', sku: 'SKU-ONE', variantName: 'Current label', product: 'Current catalog label', totalSupplied: '30', totalValue: '300' }),
      history({ suppliesno: 'AUTO-C', recordType: 'summary', productId: 'P-OTHER', sku: 'SKU-ONE', variantName: 'Current label', product: 'Other catalog product', totalSupplied: '500', totalValue: '5000' }),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.productId === 'P-LINKED')?.totalSupplied).toBe('70');
    expect(rows.find((row) => row.productId === 'P-LINKED')?.totalValue).toBe('700');
    expect(rows.find((row) => row.productId === 'P-OTHER')?.totalSupplied).toBe('500');
  });

  it('merges duplicate persisted summaries before projecting the profile summary', () => {
    const rows = buildSupplySummaryFromHistory(
      [history({ totalSupplied: '80', totalValue: '1000' })],
      [
        { ...history({ suppliesno: 'AUTO-1', totalSupplied: '100', totalValue: '2000' }), recordType: 'summary' },
        { ...history({ suppliesno: 'AUTO-2', totalSupplied: '7', totalValue: '300' }), recordType: 'summary' },
      ],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].totalSupplied).toBe('180');
    expect(rows[0].totalValue).toBe('3000');
  });

  it('falls back from an empty legacy receivedQuantity to canonical Pieces without applying a stale package unit', () => {
    expect(getSupplyReceivedInput({
      receivedQuantity: '',
      receivedUnit: 'Cartons',
      totalSupplied: '80',
    })).toEqual({ receivedQuantity: '80', receivedUnit: 'Pieces' });
  });

  it('preserves a non-empty supplier-entered package quantity and unit', () => {
    expect(getSupplyReceivedInput({
      receivedQuantity: '2',
      receivedUnit: 'Cartons',
      totalSupplied: '240',
    })).toEqual({ receivedQuantity: '2', receivedUnit: 'Cartons' });
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

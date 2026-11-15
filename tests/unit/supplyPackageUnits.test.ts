import { describe, expect, it } from 'vitest';
import { convertSupplyQuantityToPieces, getSupplyUnitOptions } from '@/lib/suppliers/supplyPackageUnits';

const stockLevels = [
  { name: 'Pieces', piecesPerUnit: 1 },
  { name: 'Cartons', piecesPerUnit: 120, unitsPerPreviousLevel: 120 },
  { name: 'Boxes', piecesPerUnit: 1200, unitsPerPreviousLevel: 10 },
];

describe('supplier package stock units', () => {
  it('offers Pieces and configured package levels in order', () => {
    expect(getSupplyUnitOptions(stockLevels).map((level) => level.name)).toEqual(['Pieces', 'Cartons', 'Boxes']);
  });
  it('converts supplier package quantities to canonical Pieces', () => {
    expect(convertSupplyQuantityToPieces('2', 'Cartons', stockLevels)).toBe(240);
    expect(convertSupplyQuantityToPieces('3', 'Boxes', stockLevels)).toBe(3600);
    expect(convertSupplyQuantityToPieces('25', 'Pieces', stockLevels)).toBe(25);
  });
  it('matches unit names case-insensitively', () => {
    expect(convertSupplyQuantityToPieces('2', 'cartons', stockLevels)).toBe(240);
  });

  it('accepts comma-grouped whole quantities from spreadsheet imports', () => {
    expect(convertSupplyQuantityToPieces('2,000', 'Pieces', stockLevels)).toBe(2000);
  });
  it('rejects blank, fractional, negative, unknown and unsafe quantities', () => {
    expect(convertSupplyQuantityToPieces('', 'Pieces', stockLevels)).toBeNull();
    expect(convertSupplyQuantityToPieces('1.5', 'Cartons', stockLevels)).toBeNull();
    expect(convertSupplyQuantityToPieces('-1', 'Pieces', stockLevels)).toBeNull();
    expect(convertSupplyQuantityToPieces('2', 'Pallets', stockLevels)).toBeNull();
    expect(convertSupplyQuantityToPieces('999999999', 'Boxes', stockLevels)).toBeNull();
  });
});

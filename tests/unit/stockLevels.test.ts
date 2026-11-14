import { describe, expect, it } from 'vitest';
import {
  formatStockLevelQuantity,
  getStockLevelRatio,
  getStockLevelFractionLabel,
  getWholeStockQuantity,
  normalizeStockLevels,
  updateStockFromWholeQuantity,
  updateStockLevelRatio,
  validateStockLevels,
} from '@/utils/stockUtils';

describe('flexible piece-based stock levels', () => {
  it('always keeps Pieces as the compulsory base unit', () => {
    expect(normalizeStockLevels([{ name: 'Boxes', piecesPerUnit: 12 }])).toEqual([
      { name: 'Pieces', piecesPerUnit: 1 },
      { name: 'Boxes', piecesPerUnit: 12 },
    ]);
  });

  it('supports any number of direct package-to-piece ratios', () => {
    const levels = [
      { name: 'Pieces', piecesPerUnit: 1 },
      { name: 'Cartons', piecesPerUnit: 10 },
      { name: 'Boxes', piecesPerUnit: 20 },
      { name: 'Pallets', piecesPerUnit: 100 },
    ];
    expect(validateStockLevels(levels)).toBeNull();
    expect(formatStockLevelQuantity(229, 10)).toBe('22.9');
    expect(formatStockLevelQuantity(229, 20)).toBe('11.45');
    expect(formatStockLevelQuantity(229, 1)).toBe('229');
  });


  it('uses the immediately preceding packaging level for each new ratio', () => {
    const levels = normalizeStockLevels([
      { name: 'Cartons', piecesPerUnit: 20 },
      { name: 'Boxes', piecesPerUnit: 240 },
      { name: 'Pallets', piecesPerUnit: 2400 },
    ]);

    expect(getStockLevelRatio(levels, 1)).toBe(20); // 20 pieces per carton
    expect(getStockLevelRatio(levels, 2)).toBe(12); // 12 cartons per box
    expect(getStockLevelRatio(levels, 3)).toBe(10); // 10 boxes per pallet
    expect(levels.map((level) => level.piecesPerUnit)).toEqual([1, 20, 240, 2400]);
  });

  it('recalculates higher cumulative piece ratios when a lower packaging ratio changes', () => {
    const levels = normalizeStockLevels([
      { name: 'Cartons', piecesPerUnit: 20 },
      { name: 'Boxes', piecesPerUnit: 240 },
      { name: 'Pallets', piecesPerUnit: 2400 },
    ]);
    const updated = updateStockLevelRatio(levels, 1, 24);

    expect(updated.map((level) => level.piecesPerUnit)).toEqual([1, 24, 288, 2880]);
    expect(updated.map((level) => getStockLevelRatio(updated, updated.indexOf(level)))).toEqual([1, 24, 12, 10]);
  });

  it('breaks one piece inventory into consistent maximum quantities at each level', () => {
    const pieceStock = 19 * 24;
    expect(getWholeStockQuantity(pieceStock, 24)).toBe(19); // Boxes
    expect(getWholeStockQuantity(pieceStock, 12)).toBe(38); // Cartons
    expect(getWholeStockQuantity(pieceStock, 1)).toBe(456); // Pieces
  });

  it('splits whole package quantities from a non-editable fractional remainder', () => {
    expect(getWholeStockQuantity(253, 10)).toBe(25);
    expect(getStockLevelFractionLabel(253, 10)).toBe('.3');
    expect(getWholeStockQuantity(253, 5)).toBe(50);
    expect(getStockLevelFractionLabel(253, 5)).toBe('.6');
    expect(getStockLevelFractionLabel(253, 1)).toBe('');
  });

  it('preserves loose pieces when the whole number of a package level is edited', () => {
    expect(updateStockFromWholeQuantity(253, 26, 10)).toBe(263);
    expect(updateStockFromWholeQuantity(253, 51, 5)).toBe(258);
    expect(updateStockFromWholeQuantity(253, 253, 1)).toBe(253);
  });

  it('rejects missing Pieces, fractional ratios, duplicate names and invalid levels', () => {
    expect(validateStockLevels([{ name: 'Boxes', piecesPerUnit: 12 }])).not.toBeNull();
    expect(validateStockLevels([
      { name: 'Pieces', piecesPerUnit: 1 },
      { name: 'Boxes', piecesPerUnit: 12.5 },
    ])).not.toBeNull();
    expect(validateStockLevels([
      { name: 'Pieces', piecesPerUnit: 1 },
      { name: 'boxes', piecesPerUnit: 12 },
      { name: 'Boxes', piecesPerUnit: 24 },
    ])).not.toBeNull();
    expect(validateStockLevels([
      { name: 'Pieces', piecesPerUnit: 1 },
      { name: 'Boxes', piecesPerUnit: 24 },
      { name: 'Cartons', piecesPerUnit: 12 },
    ])).not.toBeNull();
  });

  it('does not allow a stock conversion to overflow safe integer storage', () => {
    expect(updateStockFromWholeQuantity(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 2))
      .toBe(Number.MAX_SAFE_INTEGER);
  });
});

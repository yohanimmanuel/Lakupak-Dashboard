import { describe, expect, it } from 'vitest';
import {
  getPriceAnchorPieces,
  priceToPieceValue,
  scaleAnchoredPrice,
} from '@/utils/priceAnchorUtils';
import type { StockLevel } from '@/types/product';

const stockLevels: StockLevel[] = [
  { name: 'Pieces', piecesPerUnit: 1 },
  { name: 'Cartons', piecesPerUnit: 120 },
  { name: 'Boxes', piecesPerUnit: 1200 },
];

describe('price anchor conversions', () => {
  it('resolves direct and higher stock-level anchors in Pieces', () => {
    expect(getPriceAnchorPieces(stockLevels, 'Pieces')).toBe(1);
    expect(getPriceAnchorPieces(stockLevels, 'Cartons')).toBe(120);
    expect(getPriceAnchorPieces(stockLevels, 'Boxes')).toBe(1200);
  });

  it('re-expresses prices while preserving the per-Piece value', () => {
    expect(scaleAnchoredPrice('15000', 120, 1200, 'IDR')).toBe('150000');
    expect(scaleAnchoredPrice('15000', 120, 1, 'IDR')).toBe('125');
    expect(scaleAnchoredPrice('10000', 120, 1, 'IDR')).toBe('83.333333');
    expect(scaleAnchoredPrice('83.333333', 1, 120, 'IDR')).toBe('10000');
  });

  it('normalizes an anchored amount to the canonical per-Piece price for storage', () => {
    expect(priceToPieceValue('15000', 120, 'IDR')).toBe('125');
    expect(priceToPieceValue('150000', 1200, 'IDR')).toBe('125');
    expect(priceToPieceValue('10000', 120, 'IDR')).toBe('83.333333');
  });

  it('keeps blank draft prices blank', () => {
    expect(scaleAnchoredPrice('', 120, 1, 'IDR')).toBe('');
    expect(priceToPieceValue('', 120, 'IDR')).toBe('');
  });
});

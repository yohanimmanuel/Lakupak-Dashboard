import type { StockLevel } from '@/types/product';
import { parseNumberByCurrency } from '@/config/currencyConfig';
import { normalizeStockLevels } from '@/utils/stockUtils';

/** Resolve a configured price anchor to its cumulative equivalent in base Pieces. */
export function getPriceAnchorPieces(stockLevels: StockLevel[], unitName?: string | null): number {
  const requested = String(unitName || 'Pieces').trim().toLowerCase();
  const level = normalizeStockLevels(stockLevels).find((item) => item.name.trim().toLowerCase() === requested);
  return level && Number.isSafeInteger(level.piecesPerUnit) && level.piecesPerUnit > 0
    ? level.piecesPerUnit
    : 1;
}

/** Re-express a price from one package anchor to another without changing its per-piece value. */
export function scaleAnchoredPrice(
  raw: unknown,
  fromPieces: number,
  toPieces: number,
  currency: string,
): string {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  const parsed = parseNumberByCurrency(text, currency);
  if (!Number.isFinite(parsed)) return text;
  const scaled = (parsed / Math.max(1, fromPieces)) * Math.max(1, toPieces);
  // Keep fractional per-Piece values at six decimals; package prices remain currency-rounded.
  const precision = Math.max(1, toPieces) === 1 ? 6 : 2;
  return String(Number(scaled.toFixed(precision)));
}

/** Persist a price entered per an anchor as the canonical per-Piece price. */
export function priceToPieceValue(raw: unknown, piecesPerAnchor: number, currency: string): string {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  const parsed = parseNumberByCurrency(text, currency);
  if (!Number.isFinite(parsed)) return text;
  // VariantOption prices are Decimal(18,6) so fractional per-Piece equivalents are retained.
  return String(Number((parsed / Math.max(1, piecesPerAnchor)).toFixed(6)));
}

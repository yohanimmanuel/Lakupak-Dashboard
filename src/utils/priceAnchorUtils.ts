import type { StockLevel } from '@/types/product';
import { getCurrencyConfig, parseNumberByCurrency } from '@/config/currencyConfig';
import { normalizeStockLevels } from '@/utils/stockUtils';

/** Resolve a configured price anchor to its cumulative equivalent in base Pieces. */
export function getPriceAnchorPieces(stockLevels: StockLevel[], unitName?: string | null): number {
  const requested = String(unitName || 'Pieces').trim().toLowerCase();
  const level = normalizeStockLevels(stockLevels).find((item) => item.name.trim().toLowerCase() === requested);
  return level && Number.isSafeInteger(level.piecesPerUnit) && level.piecesPerUnit > 0
    ? level.piecesPerUnit
    : 1;
}

/** Minor units for package/display prices (IDR/JPY → 0, USD → 2). */
export function getCurrencyPriceDecimals(currency: string): number {
  const max = getCurrencyConfig(currency).formatOptions.maximumFractionDigits;
  return typeof max === 'number' && Number.isFinite(max) ? Math.max(0, max) : 2;
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
  // Per-Piece keeps 6 decimals (matches Decimal(18,6)). Package display uses currency
  // minor units so 180000/22/×22 does not resurface as 180000.04 for IDR.
  const precision = Math.max(1, toPieces) === 1 ? 6 : getCurrencyPriceDecimals(currency);
  return String(Number(scaled.toFixed(precision)));
}

export const SEGMENT_PRICE_KEY_MAX = 100;

/** Storage key for a market segment price: the buyer business type, trimmed and lowercased. */
export function segmentPriceKey(label: unknown): string {
  return String(label ?? '').trim().toLowerCase();
}

/** Re-express every segment price between anchors; blank entries are dropped. */
export function scaleSegmentPrices(
  prices: Record<string, unknown> | null | undefined,
  fromPieces: number,
  toPieces: number,
  currency: string,
): Record<string, string> {
  const scaled: Record<string, string> = {};
  if (!prices || typeof prices !== 'object' || Array.isArray(prices)) return scaled;
  for (const [key, raw] of Object.entries(prices)) {
    const value = scaleAnchoredPrice(raw, fromPieces, toPieces, currency);
    if (value) scaled[key] = value;
  }
  return scaled;
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

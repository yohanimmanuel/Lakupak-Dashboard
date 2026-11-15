import type { StockLevel } from '@/types/product';
import { formatStockLevelQuantity, getWholeStockQuantity, normalizeStockLevels } from '@/utils/stockUtils';

/** Returns Pieces followed by the valid packaging levels configured for a product. */
export function getSupplyUnitOptions(stockLevels: unknown): StockLevel[] {
  return normalizeStockLevels(stockLevels);
}

/**
 * Converts a supplier-entered whole quantity in a selected package level to Pieces.
 * Returns null for blank, fractional, negative, unknown-unit, or unsafe quantities.
 */
export function convertSupplyQuantityToPieces(
  quantity: string | number,
  unitName: string,
  stockLevels: unknown,
): number | null {
  const rawQuantity = String(quantity).trim();
  if (!rawQuantity) return null;

  const normalizedQuantity = /^\d{1,3}(,\d{3})+$/.test(rawQuantity)
    ? rawQuantity.replace(/,/g, '')
    : rawQuantity;
  if (!/^\d+$/.test(normalizedQuantity)) return null;

  const parsedQuantity = Number(normalizedQuantity);
  if (!Number.isSafeInteger(parsedQuantity) || parsedQuantity < 0) return null;

  const normalizedUnitName = unitName.trim().toLocaleLowerCase();
  const selectedLevel = getSupplyUnitOptions(stockLevels).find(
    (level) => level.name.trim().toLocaleLowerCase() === normalizedUnitName,
  );
  if (!selectedLevel || !Number.isSafeInteger(selectedLevel.piecesPerUnit)) return null;

  const pieceQuantity = parsedQuantity * selectedLevel.piecesPerUnit;
  if (!Number.isSafeInteger(pieceQuantity) || pieceQuantity > 2147483647) return null;
  return pieceQuantity;
}


export type SupplySummaryQuantity = {
  name: string;
  /** Whole packages available from the received Piece total. */
  availableQuantity: string;
  /** Mathematical package equivalent, including any fractional remainder. */
  equivalentQuantity: string;
  piecesPerUnit: number;
};

/**
 * Express the supplier's accumulated received Pieces in every stock level configured
 * for that product. The input is supplier-history totals, never VariantOption.stockQuantity.
 */
export function getSupplySummaryQuantities(
  totalSuppliedPieces: string | number,
  stockLevels: unknown,
): SupplySummaryQuantity[] {
  const raw = String(totalSuppliedPieces ?? '').trim().replace(/,/g, '');
  const pieces = Number(raw);
  const safePieces = Number.isSafeInteger(pieces) && pieces >= 0 ? pieces : 0;

  return getSupplyUnitOptions(stockLevels).map((level) => ({
    name: level.name,
    availableQuantity: getWholeStockQuantity(safePieces, level.piecesPerUnit).toLocaleString('en-US'),
    equivalentQuantity: formatStockLevelQuantity(safePieces, level.piecesPerUnit),
    piecesPerUnit: level.piecesPerUnit,
  }));
}

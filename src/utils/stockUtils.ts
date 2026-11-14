import type { StockLevel } from '../types/product';
export type { StockLevel } from '../types/product';

export type StockStatus = 'In Stock' | 'Low Stock' | 'Out of Stock';

/**
 * A packaging level is an alternative way to express the same piece inventory.
 * `piecesPerUnit` is always the direct number of base pieces represented by one unit.
 */

export const PIECE_STOCK_LEVEL: StockLevel = { name: 'Pieces', piecesPerUnit: 1 };

export const normalizeStockLevels = (raw: unknown): StockLevel[] => {
  if (!Array.isArray(raw)) return [{ ...PIECE_STOCK_LEVEL }];

  const levels: StockLevel[] = [{ ...PIECE_STOCK_LEVEL }];
  const seen = new Set<string>(['pieces']);
  let previousPiecesPerUnit = 1;

  for (const candidate of raw) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const record = candidate as Record<string, unknown>;
    const name = String(record.name ?? '').trim();
    const key = name.toLocaleLowerCase();
    if (!name || key === 'pieces' || seen.has(key)) continue;

    const storedPiecesPerUnit = Number(record.piecesPerUnit);
    const hasRelativeRatio = record.unitsPerPreviousLevel !== undefined && record.unitsPerPreviousLevel !== null;
    const relativeRatio = hasRelativeRatio
      ? Number(record.unitsPerPreviousLevel)
      : storedPiecesPerUnit / previousPiecesPerUnit;

    if (!Number.isSafeInteger(relativeRatio) || relativeRatio < 2) continue;
    const piecesPerUnit = previousPiecesPerUnit * relativeRatio;
    if (!Number.isSafeInteger(piecesPerUnit) || piecesPerUnit > 2147483647) continue;

    levels.push({ name, piecesPerUnit, unitsPerPreviousLevel: relativeRatio });
    previousPiecesPerUnit = piecesPerUnit;
    seen.add(key);
  }

  return levels;
};

export const getStockLevelRatio = (levels: StockLevel[], index: number): number => {
  if (index <= 0) return 1;
  const current = levels[index];
  const previous = levels[index - 1];
  if (!current || !previous || previous.piecesPerUnit <= 0) return 0;
  const ratio = current.unitsPerPreviousLevel ?? current.piecesPerUnit / previous.piecesPerUnit;
  return Number.isSafeInteger(ratio) && ratio >= 2 ? ratio : 0;
};

/**
 * Update a level using the number of immediately preceding-level units it contains.
 * Cumulative piecesPerUnit values are recalculated for this and all higher levels,
 * while each higher level's own relative ratio is preserved.
 */
export const updateStockLevelRatio = (
  levels: StockLevel[],
  index: number,
  unitsPerPreviousLevel: number,
): StockLevel[] => {
  if (index <= 0 || index >= levels.length) return levels;

  const next = levels.map((level) => ({ ...level }));
  const previousPieces = next[index - 1].piecesPerUnit;
  const isValidRatio = Number.isSafeInteger(unitsPerPreviousLevel) && unitsPerPreviousLevel >= 2;

  next[index] = {
    ...next[index],
    unitsPerPreviousLevel: isValidRatio ? unitsPerPreviousLevel : 0,
    piecesPerUnit: isValidRatio && previousPieces > 0
      ? previousPieces * unitsPerPreviousLevel
      : 0,
  };

  for (let levelIndex = index + 1; levelIndex < next.length; levelIndex += 1) {
    const previousRatio = getStockLevelRatio(levels, levelIndex);
    const priorPieces = next[levelIndex - 1].piecesPerUnit;
    const validPreviousRatio = Number.isSafeInteger(previousRatio) && previousRatio >= 2;
    next[levelIndex] = {
      ...next[levelIndex],
      unitsPerPreviousLevel: validPreviousRatio ? previousRatio : 0,
      piecesPerUnit: validPreviousRatio && priorPieces > 0 ? priorPieces * previousRatio : 0,
    };
  }

  return next;
};

export const validateStockLevels = (raw: unknown): string | null => {
  if (!Array.isArray(raw) || raw.length === 0) {
    return 'At least the Pieces stock level is required.';
  }
  if (raw.length > 30) return 'A product can have at most 30 stock levels.';

  const first = raw[0] as Record<string, unknown> | null;
  if (!first || String(first.name ?? '').trim() !== 'Pieces' || Number(first.piecesPerUnit) !== 1) {
    return 'Pieces must be the first stock level and must equal exactly 1 piece.';
  }

  const seen = new Set<string>(['pieces']);
  let previousPiecesPerUnit = 1;
  for (let index = 1; index < raw.length; index += 1) {
    const candidate = raw[index];
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      return `Stock level ${index + 1} is invalid.`;
    }
    const record = candidate as Record<string, unknown>;
    const name = String(record.name ?? '').trim();
    const key = name.toLocaleLowerCase();
    const piecesPerUnit = Number(record.piecesPerUnit);
    const hasRelativeRatio = record.unitsPerPreviousLevel !== undefined && record.unitsPerPreviousLevel !== null;
    const ratio = hasRelativeRatio
      ? Number(record.unitsPerPreviousLevel)
      : piecesPerUnit / previousPiecesPerUnit;

    if (!name) return `Stock level ${index + 1} needs a name.`;
    if (name.length > 40) return `Stock level "${name}" is too long (maximum 40 characters).`;
    if (seen.has(key)) return `Stock level "${name}" is duplicated.`;
    if (!Number.isSafeInteger(ratio) || ratio < 2 || ratio > 2147483647) {
      const previousName = String((raw[index - 1] as Record<string, unknown>).name ?? 'previous level');
      return `Stock level "${name}" must contain a whole number of at least 2 ${previousName}.`;
    }

    const expectedPiecesPerUnit = previousPiecesPerUnit * ratio;
    if (!Number.isSafeInteger(expectedPiecesPerUnit) || expectedPiecesPerUnit > 2147483647) {
      return `Stock level "${name}" exceeds the maximum supported stock conversion.`;
    }
    if (!Number.isSafeInteger(piecesPerUnit) || piecesPerUnit !== expectedPiecesPerUnit) {
      return `Stock level "${name}" has an inconsistent cumulative piece conversion.`;
    }

    previousPiecesPerUnit = expectedPiecesPerUnit;
    seen.add(key);
  }

  return null;
};

type StockLike = {
  stockQuantity?: number | null;
  lowStockThreshold?: number | null;
};

export function getProductTotalStock(items: StockLike[]): { totalStock: number; lowStockThreshold: number } {
  const totalStock = items.reduce((sum, it) => sum + (typeof it.stockQuantity === 'number' ? it.stockQuantity : 0), 0);
  const lowStockThreshold = items.reduce(
    (sum, it) => sum + (typeof it.lowStockThreshold === 'number' ? it.lowStockThreshold : 0),
    0,
  );
  return { totalStock, lowStockThreshold };
}

/** Per-variant / per-combination status from piece stock + piece threshold. */
export function getVariantStockStatus(stockQuantity?: number | null, lowStockThreshold?: number | null): StockStatus {
  const stock = typeof stockQuantity === 'number' ? stockQuantity : 0;
  const threshold = typeof lowStockThreshold === 'number' ? lowStockThreshold : 0;
  if (stock <= 0) return 'Out of Stock';
  if (threshold > 0 && stock <= threshold) return 'Low Stock';
  return 'In Stock';
}

/** Product-level status is always calculated from absolute piece inventory. */
export function getProductStockStatus(items: StockLike[]): StockStatus {
  const { totalStock, lowStockThreshold } = getProductTotalStock(items);
  return getVariantStockStatus(totalStock, lowStockThreshold);
}

/** Whole packages available at a level; remainder pieces are never discarded. */
export function getWholeStockQuantity(pieceQuantity: number, piecesPerUnit: number): number {
  if (!Number.isSafeInteger(pieceQuantity) || pieceQuantity < 0) return 0;
  if (!Number.isSafeInteger(piecesPerUnit) || piecesPerUnit < 1) return 0;
  return Math.floor(pieceQuantity / piecesPerUnit);
}

/** Fractional part of an equivalent package quantity, returned without its leading zero. */
export function getStockLevelFractionLabel(pieceQuantity: number, piecesPerUnit: number): string {
  if (!Number.isSafeInteger(pieceQuantity) || pieceQuantity < 0) return '';
  if (!Number.isSafeInteger(piecesPerUnit) || piecesPerUnit <= 1) return '';
  const remainder = pieceQuantity % piecesPerUnit;
  if (remainder === 0) return '';
  const fraction = (remainder / piecesPerUnit).toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  return fraction.startsWith('0') ? fraction.slice(1) : fraction;
}

/** Full equivalent quantity for summaries (e.g. 229 pieces / 10 = 22.9 boxes). */
export function formatStockLevelQuantity(pieceQuantity: number, piecesPerUnit: number): string {
  if (!Number.isFinite(pieceQuantity) || !Number.isSafeInteger(piecesPerUnit) || piecesPerUnit < 1) return '0';
  const value = pieceQuantity / piecesPerUnit;
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(value);
}

/**
 * Change the whole-number part of one packaging equivalent while preserving the loose-piece
 * remainder. Editing a Box count must not silently throw away pieces that do not make a full box.
 */
export function updateStockFromWholeQuantity(
  currentPieceQuantity: number,
  nextWholeQuantity: number,
  piecesPerUnit: number,
): number {
  if (!Number.isSafeInteger(nextWholeQuantity) || nextWholeQuantity < 0) return currentPieceQuantity;
  if (!Number.isSafeInteger(piecesPerUnit) || piecesPerUnit < 1) return currentPieceQuantity;
  const remainder = Math.max(0, currentPieceQuantity) % piecesPerUnit;
  const next = nextWholeQuantity * piecesPerUnit + remainder;
  return Number.isSafeInteger(next) && next <= 2147483647 ? next : currentPieceQuantity;
}

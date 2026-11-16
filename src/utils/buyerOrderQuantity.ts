/**
 * Unit-aware buyer order quantity helpers.
 * Quantity and unit are persisted together in the existing BuyerRecord.totalOrders
 * string, so no database migration is required.
 */

export type ParsedBuyerOrderTotal = {
  quantity: string;
  unit: string;
  isMixed: boolean;
};

const MIXED_UNIT_SEPARATOR = /\s+\+\s+/;

function parseSingleBuyerOrderTotal(value: string): { quantity: string; unit: string } | null {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(.*?)$/);
  if (!match) return null;
  return { quantity: match[1], unit: String(match[2] || '').trim() };
}

export function parseBuyerOrderTotal(
  value: string | number | null | undefined,
  fallbackUnit = 'Boxes',
): ParsedBuyerOrderTotal {
  const raw = String(value ?? '').trim();
  if (!raw) return { quantity: '', unit: fallbackUnit, isMixed: false };
  const parts = raw.split(MIXED_UNIT_SEPARATOR).map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1 && parts.every((part) => Boolean(parseSingleBuyerOrderTotal(part)?.unit))) {
    return { quantity: raw, unit: 'Multiple units', isMixed: true };
  }
  const parsed = parseSingleBuyerOrderTotal(raw);
  if (!parsed) return { quantity: raw, unit: fallbackUnit, isMixed: false };
  return { quantity: parsed.quantity, unit: parsed.unit || fallbackUnit, isMixed: false };
}

export function formatBuyerOrderTotal(quantity: string, unit: string): string {
  const qty = String(quantity ?? '').trim();
  const stockUnit = String(unit || 'Boxes').trim() || 'Boxes';
  return qty ? qty + ' ' + stockUnit : '';
}

/** Normalize legacy numeric-only records to the old Boxes default. */
export function normalizeBuyerOrderTotal(value: string | number | null | undefined, fallbackUnit = 'Boxes'): string {
  const parsed = parseBuyerOrderTotal(value, fallbackUnit);
  if (parsed.isMixed) return String(value);
  return formatBuyerOrderTotal(parsed.quantity, parsed.unit);
}

/** Sum the numeric quantities for buyer-list and chart aggregates. */
export function getBuyerOrderQuantity(value: string | number | null | undefined): number {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const parts = raw.split(MIXED_UNIT_SEPARATOR).map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1) {
    return parts.reduce((sum, part) => {
      const parsed = parseSingleBuyerOrderTotal(part);
      return sum + (parsed ? Number(parsed.quantity) || 0 : 0);
    }, 0);
  }
  const parsed = parseSingleBuyerOrderTotal(raw);
  return parsed ? Number(parsed.quantity) || 0 : Number(raw) || 0;
}

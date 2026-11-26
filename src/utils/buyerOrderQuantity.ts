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

/** Round package quantities to hundredths (avoids float noise like 6.633333333333333). */
export function roundBuyerOrderQuantity(value: string | number | null | undefined): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return parseFloat(n.toFixed(2)).toString();
}

function parseSingleBuyerOrderTotal(value: string): { quantity: string; unit: string } | null {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(.*?)$/);
  if (!match) return null;
  return { quantity: roundBuyerOrderQuantity(match[1]), unit: String(match[2] || '').trim() };
}

export function parseBuyerOrderTotal(
  value: string | number | null | undefined,
  fallbackUnit = 'Boxes',
): ParsedBuyerOrderTotal {
  const raw = String(value ?? '').trim();
  if (!raw) return { quantity: '', unit: fallbackUnit, isMixed: false };
  const parts = raw.split(MIXED_UNIT_SEPARATOR).map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1 && parts.every((part) => Boolean(parseSingleBuyerOrderTotal(part)?.unit))) {
    return {
      quantity: parts
        .map((part) => {
          const parsed = parseSingleBuyerOrderTotal(part);
          return parsed ? `${parsed.quantity}${parsed.unit ? ` ${parsed.unit}` : ''}`.trim() : part;
        })
        .join(' + '),
      unit: 'Multiple units',
      isMixed: true,
    };
  }
  const parsed = parseSingleBuyerOrderTotal(raw);
  if (!parsed) return { quantity: roundBuyerOrderQuantity(raw) || raw, unit: fallbackUnit, isMixed: false };
  return { quantity: parsed.quantity, unit: parsed.unit || fallbackUnit, isMixed: false };
}

export function formatBuyerOrderTotal(quantity: string, unit: string): string {
  const qty = roundBuyerOrderQuantity(quantity);
  const stockUnit = String(unit || 'Boxes').trim() || 'Boxes';
  return qty ? qty + ' ' + stockUnit : '';
}

/** Normalize legacy numeric-only records to the old Boxes default. */
export function normalizeBuyerOrderTotal(value: string | number | null | undefined, fallbackUnit = 'Boxes'): string {
  const parsed = parseBuyerOrderTotal(value, fallbackUnit);
  if (parsed.isMixed) return parsed.quantity;
  return formatBuyerOrderTotal(parsed.quantity, parsed.unit);
}

/** Sum the numeric quantities for buyer-list and chart aggregates. */
export function getBuyerOrderQuantity(value: string | number | null | undefined): number {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const parts = raw.split(MIXED_UNIT_SEPARATOR).map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1) {
    const sum = parts.reduce((total, part) => {
      const parsed = parseSingleBuyerOrderTotal(part);
      return total + (parsed ? Number(parsed.quantity) || 0 : 0);
    }, 0);
    return Number(sum.toFixed(2));
  }
  const parsed = parseSingleBuyerOrderTotal(raw);
  const n = parsed ? Number(parsed.quantity) || 0 : Number(raw) || 0;
  return Number(n.toFixed(2));
}

/** Display helper for profile summary chips (rounded to hundredths). */
export function formatBuyerOrderQuantityDisplay(value: string | number | null | undefined): string {
  const n = typeof value === 'number' ? value : getBuyerOrderQuantity(value);
  if (!Number.isFinite(n)) return '0';
  return parseFloat(n.toFixed(2)).toString();
}

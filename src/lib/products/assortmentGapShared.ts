/** Client-safe heatmap constants. Do not import server modules here. */

/**
 * Optional casing hints for common labels. Heatmap columns come only from
 * each distributor's buyer businessType values, not this fixed list.
 */
export const PREFERRED_ASSORTMENT_SEGMENTS = [
  'Warung',
  'Kiosk',
  'Minimarket',
  'Wholesaler',
  'Restaurant',
  'Hotel',
  'Canteen',
  'Other',
] as const;

/** @deprecated Use PREFERRED_ASSORTMENT_SEGMENTS; kept for older imports. */
export const ASSORTMENT_SEGMENTS = PREFERRED_ASSORTMENT_SEGMENTS;

export type AssortmentSegment = string;

export type AssortmentCellKind = 'missing' | 'zero' | 'low' | 'medium' | 'high';

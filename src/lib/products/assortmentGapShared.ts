/** Client-safe heatmap constants. Do not import server modules here. */

/**
 * Always-shown heatmap columns (buyer form business types, in display order).
 * Extra buyer types from the account still appear after these.
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

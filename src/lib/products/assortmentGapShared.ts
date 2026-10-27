/** Client-safe heatmap constants. Do not import server modules here. */

/** Preferred column order when these buyer types exist. Extra buyer types still appear. */
export const PREFERRED_ASSORTMENT_SEGMENTS = ['Warung', 'Kiosk', 'Minimarket', 'Wholesaler'] as const;

/** @deprecated Use PREFERRED_ASSORTMENT_SEGMENTS; kept for older imports. */
export const ASSORTMENT_SEGMENTS = PREFERRED_ASSORTMENT_SEGMENTS;

export type AssortmentSegment = string;

export type AssortmentCellKind = 'missing' | 'zero' | 'low' | 'medium' | 'high';

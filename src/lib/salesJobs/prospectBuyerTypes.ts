export const PROSPECT_BUYER_TYPES = [
  'warung',
  'kiosk',
  'minimarket',
  'restaurant',
  'hotel',
  'canteen',
  'other',
] as const;

export type ProspectBuyerType = (typeof PROSPECT_BUYER_TYPES)[number];

export function isProspectBuyerType(value: string): value is ProspectBuyerType {
  return (PROSPECT_BUYER_TYPES as readonly string[]).includes(value);
}

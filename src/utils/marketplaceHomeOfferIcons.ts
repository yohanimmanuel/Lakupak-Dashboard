/** Ionicons names supported for home offer banner (must exist in @expo/vector-icons Ionicons). */
export const OFFER_ICON_OPTIONS: { value: string; label: string }[] = [
  { value: 'gift', label: 'Gift' },
  { value: 'flash', label: 'Flash' },
  { value: 'flame', label: 'Flame' },
  { value: 'pricetag', label: 'Price tag' },
  { value: 'cart', label: 'Cart' },
  { value: 'star', label: 'Star' },
  { value: 'heart', label: 'Heart' },
  { value: 'megaphone', label: 'Megaphone' },
  { value: 'ribbon', label: 'Ribbon' },
  { value: 'trophy', label: 'Trophy' },
  { value: 'rocket', label: 'Rocket' },
];

export const OFFER_ICON_WHITELIST = new Set(OFFER_ICON_OPTIONS.map((o) => o.value));

export function normalizeOfferIconKey(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const key = value.trim().toLowerCase();
  return OFFER_ICON_WHITELIST.has(key) ? key : fallback;
}

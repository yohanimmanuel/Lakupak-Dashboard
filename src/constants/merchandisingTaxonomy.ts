/**
 * Merchandising taxonomy (predefined slugs + synonyms) vs **sales channel**.
 * `Product.productCategory` stores sales channel only (Retail / Wholesale / Both).
 * `Product.merchandisingCategorySlug` stores the merchandising row below.
 */

export type MerchandisingCategoryDef = {
  slug: string;
  label: string;
  /** Extra tokens that should match this category in search (lowercase ok). */
  synonyms: string[];
};

/** Channel / pricing model — separate from merchandising taxonomy. */
export const SALES_CHANNELS = [
  { value: 'Retail', label: 'Retail' },
  { value: 'Wholesale', label: 'Wholesale' },
  { value: 'Both', label: 'Retail & Wholesale' },
] as const;

export type SalesChannelValue = (typeof SALES_CHANNELS)[number]['value'];

/** Values that must never dominate "By Category" facets (legacy misuse of productCategory). */
export const LEGACY_CHANNEL_STRINGS = new Set(
  ['retail', 'wholesale', 'both', 'retail & wholesale', 'b2b', 'distributor'].map((s) => s.toLowerCase()),
);

const MERCH: MerchandisingCategoryDef[] = [
  {
    slug: 'mobile-accessories',
    label: 'Mobile Accessories',
    synonyms: ['phone case', 'charger', 'charging', 'cable', 'usb', 'usb-c', 'type c', 'type-c', 'lightning', 'adapter', 'power bank', 'screen protector'],
  },
  {
    slug: 'cables-chargers',
    label: 'Cables & Chargers',
    synonyms: ['cable', 'charger', 'adapter', 'usb', 'wall charger', 'fast charging'],
  },
  {
    slug: 'computers-peripherals',
    label: 'Computers & Peripherals',
    synonyms: ['keyboard', 'mouse', 'monitor', 'laptop', 'desktop', 'hub', 'dongle'],
  },
  {
    slug: 'home-appliances',
    label: 'Home Appliances',
    synonyms: ['fan', 'iron', 'vacuum', 'blender', 'kettle', 'rice cooker'],
  },
  {
    slug: 'food-beverage',
    label: 'Food & Beverage',
    synonyms: ['snack', 'drink', 'beverage', 'coffee', 'tea', 'instant'],
  },
  {
    slug: 'beauty-personal-care',
    label: 'Beauty & Personal Care',
    synonyms: ['skincare', 'makeup', 'shampoo', 'soap', 'perfume'],
  },
  {
    slug: 'fashion-apparel',
    label: 'Fashion & Apparel',
    synonyms: ['shirt', 'dress', 'shoes', 'bag', 'watch', 'apparel'],
  },
  {
    slug: 'home-living',
    label: 'Home & Living',
    synonyms: ['furniture', 'decor', 'bedding', 'kitchenware', 'storage'],
  },
  {
    slug: 'sports-outdoors',
    label: 'Sports & Outdoors',
    synonyms: ['fitness', 'gym', 'camping', 'bicycle', 'outdoor'],
  },
  {
    slug: 'office-stationery',
    label: 'Office & Stationery',
    synonyms: ['office', 'stationery', 'notebook', 'pen', 'desk'],
  },
  {
    slug: 'automotive',
    label: 'Automotive',
    synonyms: ['car', 'auto', 'vehicle', 'motor'],
  },
  {
    slug: 'baby-kids',
    label: 'Baby & Kids',
    synonyms: ['baby', 'kids', 'toddler', 'diaper', 'stroller'],
  },
  {
    slug: 'pets',
    label: 'Pets',
    synonyms: ['pet', 'dog', 'cat', 'aquarium'],
  },
  {
    slug: 'health-wellness',
    label: 'Health & Wellness',
    synonyms: ['vitamin', 'supplement', 'mask', 'thermometer', 'first aid'],
  },
  {
    slug: 'others',
    label: 'Others',
    synonyms: [],
  },
];

export const MERCHANDISING_CATEGORIES: MerchandisingCategoryDef[] = MERCH;

export function getMerchandisingLabel(slug: string | null | undefined): string | null {
  if (!slug?.trim()) return null;
  const found = MERCHANDISING_CATEGORIES.find((c) => c.slug === slug.trim());
  return found ? found.label : null;
}

export function isValidMerchandisingSlug(slug: string): boolean {
  return MERCHANDISING_CATEGORIES.some((c) => c.slug === slug);
}

/** Map legacy free-text productCategory to slug when it matches a label (case-insensitive). */
export function slugFromLegacyProductCategory(raw: string | null | undefined): string | null {
  const t = (raw || '').trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  if (LEGACY_CHANNEL_STRINGS.has(lower)) return null;
  const byLabel = MERCHANDISING_CATEGORIES.find((c) => c.label.toLowerCase() === lower);
  if (byLabel) return byLabel.slug;
  const bySlug = MERCHANDISING_CATEGORIES.find((c) => c.slug === t);
  return bySlug ? bySlug.slug : null;
}

/**
 * If the user query contains any synonym, return matching merchandising slugs (for OR filters).
 */
export function merchandisingSlugsMatchingQuery(search: string): string[] {
  const q = (search || '').trim().toLowerCase();
  if (!q) return [];
  const out = new Set<string>();
  for (const cat of MERCHANDISING_CATEGORIES) {
    const hay = [cat.label.toLowerCase(), ...cat.synonyms.map((s) => s.toLowerCase())];
    for (const needle of hay) {
      if (!needle) continue;
      if (q.includes(needle)) {
        out.add(cat.slug);
        break;
      }
    }
  }
  return Array.from(out);
}

/** Resolve UI / URL category pill (label or slug) to canonical slug. */
export function merchandisingSlugFromLabelOrSlug(input: string): string | null {
  const t = (input || '').trim();
  if (!t) return null;
  if (isValidMerchandisingSlug(t)) return t;
  const byLabel = MERCHANDISING_CATEGORIES.find((c) => c.label.toLowerCase() === t.toLowerCase());
  return byLabel?.slug ?? null;
}

/** Canonical merchandising slug for writes; invalid or empty → `others`. */
export function normalizeMerchandisingCategorySlug(slug?: string | null): string {
  const raw = (slug || '').trim();
  if (raw && isValidMerchandisingSlug(raw)) return raw;
  return 'others';
}

const DEFAULT_SALES_CHANNEL = 'Retail';

/** Normalize `productCategory` field (sales channel only). */
export function normalizeSalesChannel(raw: string | null | undefined): string {
  const t = (raw || '').trim();
  if (!t) return DEFAULT_SALES_CHANNEL;
  const allowed = new Set(SALES_CHANNELS.map((s) => s.value));
  if (allowed.has(t as SalesChannelValue)) return t;
  const lower = t.toLowerCase();
  if (lower === 'retail') return 'Retail';
  if (lower === 'wholesale') return 'Wholesale';
  if (lower === 'both') return 'Both';
  return DEFAULT_SALES_CHANNEL;
}

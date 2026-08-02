// Category utility for Laku Dashboard
// Predefined product types shown when creating/editing catalog products.

import {
  Utensils,
  Smartphone,
  Monitor,
  Shirt,
  Home,
  Dumbbell,
  Sparkles,
  BookOpen,
  Car,
  Heart,
  Gamepad2,
  Briefcase,
  Gem,
  Music,
  PawPrint,
  Plane,
  Camera,
  Wrench,
  Baby,
  Watch,
  Package,
  Boxes,
  ShoppingBag,
  Apple,
  SprayCan,
  Pill,
  HeartHandshake,
  Footprints,
  type LucideIcon,
} from 'lucide-react';

export interface CategoryOption {
  value: string;
  label: string;
  icon?: string;
  color?: string;
}

/**
 * Shopee-inspired wholesale taxonomy — clearer compound names,
 * no vague single-word or room-level splits.
 */
const predefinedCategories: CategoryOption[] = [
  { value: 'Food & Beverages', label: 'Food & Beverages', icon: 'Utensils', color: '#84CC16' },
  { value: 'Fresh Produce', label: 'Fresh Produce', icon: 'Apple', color: '#65A30D' },
  { value: 'Mobile & Gadgets', label: 'Mobile & Gadgets', icon: 'Smartphone', color: '#3B82F6' },
  { value: 'Computers & Peripherals', label: 'Computers & Peripherals', icon: 'Monitor', color: '#2563EB' },
  { value: 'Home Appliances', label: 'Home Appliances', icon: 'Package', color: '#374151' },
  { value: "Men's Wear", label: "Men's Wear", icon: 'Shirt', color: '#2563EB' },
  { value: "Women's Apparel", label: "Women's Apparel", icon: 'Sparkles', color: '#EC4899' },
  { value: "Men's Shoes", label: "Men's Shoes", icon: 'Footprints', color: '#1D4ED8' },
  { value: "Women's Shoes", label: "Women's Shoes", icon: 'Footprints', color: '#DB2777' },
  { value: "Men's Bags", label: "Men's Bags", icon: 'Briefcase', color: '#B45309' },
  { value: "Women's Bags", label: "Women's Bags", icon: 'ShoppingBag', color: '#C2410C' },
  { value: 'Kids Fashion', label: 'Kids Fashion', icon: 'Baby', color: '#F59E0B' },
  { value: 'Sports & Outdoors', label: 'Sports & Outdoors', icon: 'Dumbbell', color: '#F59E0B' },
  { value: 'Beauty & Personal Care', label: 'Beauty & Personal Care', icon: 'Sparkles', color: '#8B5CF6' },
  { value: 'Health & Wellness', label: 'Health & Wellness', icon: 'Heart', color: '#EC4899' },
  { value: 'Pharmacy & Medical', label: 'Pharmacy & Medical', icon: 'Pill', color: '#DC2626' },
  { value: 'Home & Living', label: 'Home & Living', icon: 'Home', color: '#10B981' },
  { value: 'Household Supplies', label: 'Household Supplies', icon: 'SprayCan', color: '#0EA5E9' },
  { value: 'Toys, Kids & Babies', label: 'Toys, Kids & Babies', icon: 'Baby', color: '#FBBF24' },
  { value: 'Mom & Baby Care', label: 'Mom & Baby Care', icon: 'HeartHandshake', color: '#F472B6' },
  { value: 'Pet Supplies', label: 'Pet Supplies', icon: 'PawPrint', color: '#F97316' },
  { value: 'Automotive & Motorbike', label: 'Automotive & Motorbike', icon: 'Car', color: '#374151' },
  { value: 'Tools & Hardware', label: 'Tools & Hardware', icon: 'Wrench', color: '#6B7280' },
  { value: 'Office & Stationery', label: 'Office & Stationery', icon: 'Briefcase', color: '#6366F1' },
  { value: 'Cameras & Drones', label: 'Cameras & Drones', icon: 'Camera', color: '#6B7280' },
  { value: 'Video Games', label: 'Video Games', icon: 'Gamepad2', color: '#8B5CF6' },
  { value: 'Hobbies & Books', label: 'Hobbies & Books', icon: 'BookOpen', color: '#6B7280' },
  { value: 'Jewelry & Accessories', label: 'Jewelry & Accessories', icon: 'Gem', color: '#F59E0B' },
  { value: 'Watches', label: 'Watches', icon: 'Watch', color: '#0F172A' },
  { value: 'Music & Audio', label: 'Music & Audio', icon: 'Music', color: '#8B5CF6' },
  { value: 'Travel & Luggage', label: 'Travel & Luggage', icon: 'Plane', color: '#06B6D4' },
  { value: 'Miscellaneous', label: 'Miscellaneous', icon: 'Boxes', color: '#94A3B8' },
];

/** Map legacy single-word / room-level types onto the new taxonomy. */
export const LEGACY_CATEGORY_MAP: Record<string, string> = {
  'Food & Beverage': 'Food & Beverages',
  Technology: 'Mobile & Gadgets',
  // Old broad fashion bucket — kept as-is for existing products; new picks use the split list.
  Fashion: 'Fashion & Apparel',
  'Bags & Wallets': 'Bags & Wallets',
  'Home & Garden': 'Home & Living',
  Sports: 'Sports & Outdoors',
  Beauty: 'Beauty & Personal Care',
  Books: 'Hobbies & Books',
  Automotive: 'Automotive & Motorbike',
  Health: 'Health & Wellness',
  Toys: 'Toys, Kids & Babies',
  Office: 'Office & Stationery',
  Garden: 'Home & Living',
  Jewelry: 'Jewelry & Accessories',
  Music: 'Music & Audio',
  Pets: 'Pet Supplies',
  Travel: 'Travel & Luggage',
  Art: 'Hobbies & Books',
  Photography: 'Cameras & Drones',
  Gaming: 'Video Games',
  Furniture: 'Home & Living',
  Tools: 'Tools & Hardware',
  Baby: 'Toys, Kids & Babies',
  Outdoor: 'Sports & Outdoors',
  Kitchen: 'Home Appliances',
  Bathroom: 'Home & Living',
  Bedroom: 'Home & Living',
  'Living Room': 'Home & Living',
  Dining: 'Home & Living',
  Storage: 'Home & Living',
  Lighting: 'Home & Living',
  Decor: 'Home & Living',
  Appliances: 'Home Appliances',
  Cleaning: 'Household Supplies',
  Organization: 'Office & Stationery',
  Safety: 'Tools & Hardware',
};

export function canonicalizeCategory(value: string | null | undefined): string {
  const key = (value ?? '').trim();
  if (!key) return '';
  return LEGACY_CATEGORY_MAP[key] ?? key;
}

/**
 * Values that should match a marketplace category filter.
 * Includes the canonical name plus every legacy alias that maps to it,
 * so products still tagged "Fashion" appear under "Fashion & Apparel".
 */
export function expandCategoryFilterValues(value: string | null | undefined): string[] {
  const raw = (value ?? '').trim();
  if (!raw || raw === 'All') return [];

  const canonical = canonicalizeCategory(raw);
  const out = new Set<string>();
  if (canonical) out.add(canonical);
  if (raw) out.add(raw);

  for (const [legacy, target] of Object.entries(LEGACY_CATEGORY_MAP)) {
    if (target === canonical) out.add(legacy);
  }

  return Array.from(out);
}

export const getAvailableCategories = (): CategoryOption[] => {
  return [...predefinedCategories];
};

export const getCategoryByValue = (value: string): CategoryOption | undefined => {
  const canonical = canonicalizeCategory(value);
  return predefinedCategories.find(
    (category) => category.value === canonical || category.value === value,
  );
};

export const getCategoryIcon = (value: string): string => {
  const category = getCategoryByValue(value);
  return category?.icon || 'Package';
};

/** Optional pictorial asset under /public/categories (falls back to Lucide icon). */
const CATEGORY_IMAGES: Record<string, string> = {
  'Food & Beverages': '/categories/foodnbeverage.png',
  'Fresh Produce': '/categories/freshproduce.png',
  'Mobile & Gadgets': '/categories/mobilegadgets.png',
  'Computers & Peripherals': '/categories/computerperipherals.png',
  'Home Appliances': '/categories/homeappliances.png',
  "Men's Wear": '/categories/menswear.png',
  "Women's Apparel": '/categories/womensapparel.png',
  "Men's Shoes": '/categories/menshoes.png',
  "Women's Shoes": '/categories/womenshoes.png',
  "Men's Bags": '/categories/mensbag.png',
  "Women's Bags": '/categories/womensbag.png',
  'Kids Fashion': '/categories/kidsfashion.png',
  'Sports & Outdoors': '/categories/sportsoutdoors.png',
  'Beauty & Personal Care': '/categories/beautycare.png',
  'Health & Wellness': '/categories/healthwellness.png',
  'Pharmacy & Medical': '/categories/pharmacies.png',
  'Home & Living': '/categories/homeliving.png',
  'Household Supplies': '/categories/householdsupplies.png',
  'Toys, Kids & Babies': '/categories/toys.png',
  'Mom & Baby Care': '/categories/babycare.png',
  'Pet Supplies': '/categories/petsupplies.png',
  'Automotive & Motorbike': '/categories/automotive.png',
  'Tools & Hardware': '/categories/toolshardware.png',
  'Office & Stationery': '/categories/officestationaires.png',
  'Cameras & Drones': '/categories/camerasdrones.png',
  'Video Games': '/categories/videogames.png',
  'Hobbies & Books': '/categories/hobbiesbooks.png',
  'Jewelry & Accessories': '/categories/jeweleriesaccessories.png',
  Watches: '/categories/watch.png',
  'Music & Audio': '/categories/musicaudio.png',
  'Travel & Luggage': '/categories/travelluggages.png',
  Miscellaneous: '/categories/miscellaneous.png',
};

export const getCategoryImageSrc = (value: string | null | undefined): string | null => {
  const key = canonicalizeCategory(value);
  if (!key) return null;
  return CATEGORY_IMAGES[key] ?? null;
};

export const getCategoryIconComponent = (value: string) => {
  const iconName = getCategoryIcon(value);
  const iconMap: Record<string, LucideIcon> = {
    Utensils,
    Smartphone,
    Monitor,
    Shirt,
    Home,
    Dumbbell,
    Sparkles,
    BookOpen,
    Car,
    Heart,
    Gamepad2,
    Briefcase,
    Gem,
    Music,
    PawPrint,
    Plane,
    Camera,
    Wrench,
    Baby,
    Watch,
    Package,
    Boxes,
    ShoppingBag,
    Apple,
    SprayCan,
    Pill,
    HeartHandshake,
    Footprints,
  };
  return iconMap[iconName] || Package;
};

export const getCategoryColor = (value: string): string => {
  const category = getCategoryByValue(value);
  return category?.color || '#6B7280';
};

export const categoryExists = (value: string): boolean => {
  const canonical = canonicalizeCategory(value);
  return predefinedCategories.some((category) => category.value === canonical);
};

export const addCustomCategory = (value: string, label: string): CategoryOption => {
  return {
    value,
    label,
    icon: 'Package',
    color: '#6B7280',
  };
};

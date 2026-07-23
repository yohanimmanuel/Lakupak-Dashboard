import type { LucideIcon } from 'lucide-react';
import {
  Users,
  Package,
  ShoppingCart,
  Tag,
  Megaphone,
  Store,
  Truck,
} from 'lucide-react';

export type FeatureModuleSlug =
  | 'clients'
  | 'products'
  | 'orders'
  | 'offers'
  | 'marketing'
  | 'marketplace'
  | 'logistics';

export type FeatureMenuGroup = 'sell' | 'grow' | 'deliver';

export type LakuSurface = 'dashboard' | 'marketplace' | 'driver';

export type FeatureModuleDef = {
  slug: FeatureModuleSlug;
  group: FeatureMenuGroup;
  icon: LucideIcon;
  featured?: boolean;
  /** Which Laku products this module connects across the loop */
  surfaces: LakuSurface[];
};

export const FEATURE_MODULES: FeatureModuleDef[] = [
  { slug: 'clients', group: 'sell', icon: Users, surfaces: ['dashboard'] },
  { slug: 'products', group: 'sell', icon: Package, surfaces: ['dashboard', 'marketplace'] },
  { slug: 'orders', group: 'sell', icon: ShoppingCart, surfaces: ['dashboard', 'marketplace', 'driver'] },
  { slug: 'offers', group: 'sell', icon: Tag, surfaces: ['dashboard', 'marketplace'] },
  { slug: 'marketing', group: 'grow', icon: Megaphone, surfaces: ['dashboard', 'marketplace'] },
  { slug: 'marketplace', group: 'grow', icon: Store, featured: true, surfaces: ['dashboard', 'marketplace'] },
  { slug: 'logistics', group: 'deliver', icon: Truck, surfaces: ['dashboard', 'driver'] },
];

export const FEATURE_MENU_GROUPS: FeatureMenuGroup[] = ['sell', 'grow', 'deliver'];

export function getFeatureModule(slug: string): FeatureModuleDef | undefined {
  return FEATURE_MODULES.find((m) => m.slug === slug);
}

export function getFeaturedModule(): FeatureModuleDef {
  return FEATURE_MODULES.find((m) => m.featured) ?? FEATURE_MODULES[0];
}

export function featurePath(locale: string, slug?: FeatureModuleSlug): string {
  if (!slug) return `/${locale}/landing/features`;
  return `/${locale}/landing/features/${slug}`;
}

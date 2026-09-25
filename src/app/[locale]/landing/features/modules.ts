import type { LucideIcon } from 'lucide-react';
import {
  Users,
  Package,
  ShoppingCart,
  Tag,
  Megaphone,
  Store,
  BarChart3,
  Zap,
} from 'lucide-react';

export type FeatureModuleSlug =
  | 'clients'
  | 'products'
  | 'orders'
  | 'offers'
  | 'marketing'
  | 'marketplace'
  | 'analytics'
  | 'automations';

export type FeatureMenuGroup = 'sell' | 'grow';

export type LakuSurface = 'dashboard' | 'marketplace';

export type FeatureModuleDef = {
  slug: FeatureModuleSlug;
  group: FeatureMenuGroup;
  icon: LucideIcon;
  featured?: boolean;
  /** Which Laku products this module connects across the loop */
  surfaces: LakuSurface[];
  /** Detail-section feature count (default 3, max 6) */
  pointsCount?: number;
  /** Overview unlock cards (default 3, max 6) */
  highlightsCount?: number;
};

export const FEATURE_MODULES: FeatureModuleDef[] = [
  {
    slug: 'clients',
    group: 'sell',
    icon: Users,
    surfaces: ['dashboard', 'marketplace'],
    pointsCount: 5,
    highlightsCount: 3,
  },
  {
    slug: 'products',
    group: 'sell',
    icon: Package,
    surfaces: ['dashboard', 'marketplace'],
    pointsCount: 5,
    highlightsCount: 3,
  },
  { slug: 'orders', group: 'sell', icon: ShoppingCart, surfaces: ['dashboard', 'marketplace'], pointsCount: 4, highlightsCount: 3 },
  { slug: 'offers', group: 'sell', icon: Tag, surfaces: ['dashboard', 'marketplace'], pointsCount: 4, highlightsCount: 3 },
  { slug: 'marketing', group: 'grow', icon: Megaphone, surfaces: ['dashboard'], pointsCount: 3, highlightsCount: 3 },
  { slug: 'marketplace', group: 'grow', icon: Store, featured: true, surfaces: ['dashboard', 'marketplace'], pointsCount: 4, highlightsCount: 3 },
  { slug: 'analytics', group: 'grow', icon: BarChart3, surfaces: ['dashboard'], pointsCount: 4, highlightsCount: 3 },
  { slug: 'automations', group: 'grow', icon: Zap, surfaces: ['dashboard'], pointsCount: 5, highlightsCount: 3 },
];

export const FEATURE_MENU_GROUPS: FeatureMenuGroup[] = ['sell', 'grow'];

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

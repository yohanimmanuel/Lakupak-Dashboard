import {
  ShoppingCart,
  Package,
  Users,
  Building2,
  Layers,
  // Briefcase,
  // Megaphone,
  // Activity,
  Target,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type WidgetId =
  | 'conversion'
  | 'opportunities'
  | 'analytics'
  | 'orders'
  | 'products'
  | 'buyers'
  | 'suppliers'
  | 'salesJobs'
  | 'inventory'
  | 'sales';

export interface WidgetDefinition {
  id: WidgetId;
  defaultActive: boolean;
  icon: LucideIcon;
}

export const WIDGET_LIBRARY: WidgetDefinition[] = [
  // MVP pause: sales / analytics entry widgets
  // {
  //   id: 'conversion',
  //   defaultActive: true,
  //   icon: Target,
  // },
  // {
  //   id: 'analytics',
  //   defaultActive: true,
  //   icon: Activity,
  // },
  {
    id: 'opportunities',
    defaultActive: true,
    icon: Target,
  },
  {
    id: 'orders',
    defaultActive: true,
    icon: ShoppingCart,
  },
  {
    id: 'products',
    defaultActive: true,
    icon: Package,
  },
  {
    id: 'inventory',
    defaultActive: true,
    icon: Layers,
  },
  {
    id: 'buyers',
    defaultActive: true,
    icon: Users,
  },
  {
    id: 'suppliers',
    defaultActive: true,
    icon: Building2,
  },
  // {
  //   id: 'salesJobs',
  //   defaultActive: false,
  //   icon: Briefcase,
  // },
  // {
  //   id: 'sales',
  //   defaultActive: false,
  //   icon: Megaphone,
  // },
];

export const DEFAULT_WIDGET_ORDER: WidgetId[] = WIDGET_LIBRARY.filter(
  (widget) => widget.defaultActive,
).map((widget) => widget.id);

export const WIDGET_ID_SET = new Set<WidgetId>(
  WIDGET_LIBRARY.map((widget) => widget.id),
);

export type WidgetLayoutStorage = {
  order: WidgetId[];
  conversionWidgetIntroduced?: boolean;
  opportunitiesWidgetIntroduced?: boolean;
};

/** Uniform size for all widgets in the 2-column dashboard layout */
export const UNIFORM_WIDGET_LAYOUT = 'min-h-[320px]';

export const MAX_PIPELINE_ROWS = 3;
export const MAX_PRODUCT_PERFORMANCE_ROWS = 3;

export const WIDGET_LAYOUT_STORAGE_PREFIX = 'laku-dashboard-widgets';

export function getWidgetLayoutStorageKey(userId: number | null | undefined): string | null {
  if (userId == null || typeof userId !== 'number' || Number.isNaN(userId)) {
    return null;
  }
  return `${WIDGET_LAYOUT_STORAGE_PREFIX}-${userId}`;
}


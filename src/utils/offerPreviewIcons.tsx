'use client';

import type { CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Gift,
  Zap,
  Flame,
  Tag,
  ShoppingCart,
  Star,
  Heart,
  Megaphone,
  Ribbon,
  Trophy,
  Rocket,
} from 'lucide-react';
import { normalizeOfferIconKey } from '@/utils/marketplaceHomeOfferIcons';

/** Lucide equivalents for Ionicons keys used in SaleBanner (visual parity for admin preview). */
const BY_KEY: Record<string, LucideIcon> = {
  gift: Gift,
  flash: Zap,
  flame: Flame,
  pricetag: Tag,
  cart: ShoppingCart,
  star: Star,
  heart: Heart,
  megaphone: Megaphone,
  ribbon: Ribbon,
  trophy: Trophy,
  rocket: Rocket,
};

export function OfferPreviewIcon({
  iconKey,
  fallbackKey,
  size,
  className,
  style,
}: {
  iconKey: string;
  fallbackKey?: string;
  size: number;
  className?: string;
  style?: CSSProperties;
}) {
  const k = normalizeOfferIconKey(iconKey, fallbackKey ?? 'gift');
  const Icon = BY_KEY[k] ?? Gift;
  return <Icon size={size} className={className} style={style} strokeWidth={2} aria-hidden />;
}

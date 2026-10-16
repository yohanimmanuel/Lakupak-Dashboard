'use client';

import React from 'react';
import { Gift, TrendingUp, Users, Archive } from 'lucide-react';
import { Offer } from '@/types/offer';
import { useOffersTranslations } from '@/hooks/useOffersTranslations';
import { groupOffers } from './OfferTable';
import {
  STAT_ICON_BG_BLUE,
  STAT_ICON_BG_GREEN,
  STAT_ICON_BLUE,
  STAT_ICON_GREEN,
} from '@/utils/statCardStyles';

interface OfferStatCardsProps {
  offers: Offer[];
}

export default function OfferStatCards({ offers = [] }: OfferStatCardsProps) {
  const { tCards } = useOffersTranslations();

  const stats = React.useMemo(() => {
    const groups = groupOffers(offers);
    const totalOffers = groups.length;
    const activeOffers = groups.filter((g) => g.primary.status === 'active').length;
    const expiredOffers = groups.filter((g) => g.primary.status === 'expired').length;
    const clientCount = new Set(offers.map((o) => o.buyerId).filter(Boolean)).size;

    return [
      {
        id: 'totalOffers',
        label: tCards('totalOffers'),
        value: totalOffers,
        icon: <Gift className={`w-6 h-6 ${STAT_ICON_BLUE}`} />,
        color: STAT_ICON_BG_BLUE,
      },
      {
        id: 'activeOffers',
        label: tCards('activeOffers'),
        value: activeOffers,
        icon: <TrendingUp className={`w-6 h-6 ${STAT_ICON_GREEN}`} />,
        color: STAT_ICON_BG_GREEN,
      },
      {
        id: 'byClient',
        label: tCards('clientsWithRates'),
        value: clientCount,
        icon: <Users className={`w-6 h-6 ${STAT_ICON_BLUE}`} />,
        color: STAT_ICON_BG_BLUE,
      },
      {
        id: 'expiredOffers',
        label: tCards('expiredOffers'),
        value: expiredOffers,
        icon: <Archive className={`w-6 h-6 ${STAT_ICON_BLUE}`} />,
        color: STAT_ICON_BG_BLUE,
      },
    ];
  }, [offers, tCards]);

  return (
    <div className="mx-auto grid w-full grid-cols-1 gap-3 @3xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.id}
          className="flex items-center gap-4 p-4 rounded-lg bg-white border border-[#e6e6e6]"
        >
          <div className={`flex items-center justify-center w-12 h-12 rounded-lg ${stat.color}`}>
            {stat.icon}
          </div>
          <div>
            <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{stat.label}</div>
            <div className="text-xl font-bold text-black">{stat.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

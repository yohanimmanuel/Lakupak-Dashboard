'use client';

import React from 'react';
import { Gift, Percent, TrendingUp, Users } from 'lucide-react';
import { Offer } from '@/types/offer';
import { useOffersTranslations } from '@/hooks/useOffersTranslations';
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
    const totalOffers = offers.length;
    const activeOffers = offers.filter((offer) => offer.status === 'active').length;
    const totalUsage = offers.reduce((sum, offer) => sum + (offer.totalUsage || 0), 0);
    const usedOffers = offers.filter((offer) => (offer.totalUsage || 0) > 0).length;
    const conversionRate = totalOffers > 0 ? (usedOffers / totalOffers) * 100 : 0;

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
        id: 'conversionRate',
        label: tCards('conversionRate'),
        value: `${conversionRate.toFixed(1)}%`,
        icon: <Percent className={`w-6 h-6 ${STAT_ICON_BLUE}`} />,
        color: STAT_ICON_BG_BLUE,
      },
      {
        id: 'totalRedemptions',
        label: tCards('totalRedemptions'),
        value: totalUsage,
        icon: <Users className={`w-6 h-6 ${STAT_ICON_BLUE}`} />,
        color: STAT_ICON_BG_BLUE,
      },
    ];
  }, [offers, tCards]);

  return (
    <div className="w-full mx-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
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

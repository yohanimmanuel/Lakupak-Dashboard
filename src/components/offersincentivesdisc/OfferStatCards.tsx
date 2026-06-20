'use client';

import React from 'react';
import { Gift, Percent, TrendingUp, Users } from 'lucide-react';
import { Offer } from '@/types/offer';
import { cumulativeCountGrowth, formatLegacyTrend } from '@/utils/monthOverMonthGrowth';
import { StatCardTrendRow } from '@/components/stats/StatCardTrendRow';
import { useOffersTranslations } from '@/hooks/useOffersTranslations';

interface OfferStatCardsProps {
  offers: Offer[];
}

export default function OfferStatCards({ offers = [] }: OfferStatCardsProps) {
  const { tCards } = useOffersTranslations();

  const stats = React.useMemo(() => {
    const totalOffers = offers.length;
    const activeOffers = offers.filter(offer => offer.status === 'active').length;
    
    const totalDiscountGiven = offers.reduce((sum, offer) => {
      return sum + (offer.totalDiscountGiven || 0);
    }, 0);
    
    const totalUsage = offers.reduce((sum, offer) => sum + (offer.totalUsage || 0), 0);
    
    const usedOffers = offers.filter(offer => (offer.totalUsage || 0) > 0).length;
    const conversionRate = totalOffers > 0 ? (usedOffers / totalOffers) * 100 : 0;

    const totalOffersGrowth = cumulativeCountGrowth(offers, (offer) => offer.createdAt);
    const unavailableTrend = formatLegacyTrend(null);

    return [
      {
        id: 'totalOffers',
        label: tCards('totalOffers'),
        value: totalOffers,
        icon: <Gift className="w-6 h-6 text-[#0a61d7]" />,
        color: 'bg-[#f7faff]',
        trend: formatLegacyTrend(totalOffersGrowth),
      },
      {
        id: 'activeOffers',
        label: tCards('activeOffers'),
        value: activeOffers,
        icon: <TrendingUp className="w-6 h-6 text-green-500" />,
        color: 'bg-[#e6f7ec]',
        trend: unavailableTrend,
      },
      {
        id: 'conversionRate',
        label: tCards('conversionRate'),
        value: `${conversionRate.toFixed(1)}%`,
        icon: <Percent className="w-6 h-6 text-orange-500" />,
        color: 'bg-[#fff7ed]',
        trend: { percent: `${usedOffers}/${totalOffers}`, label: tCards('offersUsed'), up: conversionRate > 50 }
      },
      {
        id: 'totalRedemptions',
        label: tCards('totalRedemptions'),
        value: totalUsage,
        icon: <Users className="w-6 h-6 text-purple-500" />,
        color: 'bg-[#f3f0ff]',
        trend: { percent: totalUsage > 0 ? tCards('active') : tCards('noUsage'), label: tCards('redemptionStatus'), up: totalUsage > 0 }
      }
    ];
  }, [offers, tCards]);

  return (
    <div className="w-full mx-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map((stat) => (
        <div
          key={stat.id}
          className={`flex flex-col justify-between p-4 rounded-lg bg-white border border-[#e6e6e6] ${stat.color}`}
        >
          <div className="flex items-center gap-4 border-b border-[#e6e6e6] pb-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-white">
              {stat.icon}
            </div>
            <div>
              <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{stat.label}</div>
              <div className="text-xl font-bold text-black">{stat.value}</div>
            </div>
          </div>
          <StatCardTrendRow trend={stat.trend} />
        </div>
      ))}
    </div>
  );
}

'use client';

import React from 'react';
import { Gift, Percent, TrendingUp, TrendingDown, Users, DollarSign } from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';
import { Offer } from '@/types/offer';

// This function is no longer needed since we use offer.totalDiscountGiven directly
// which is updated by the order creation process via trackOfferUsage

interface OfferStatCardsProps {
  offers: Offer[];
}

export default function OfferStatCards({ offers = [] }: OfferStatCardsProps) {
  const user = useUserStore(state => state.user);
  
  const userCurrency = user?.currency || getDefaultCurrency();

  const stats = React.useMemo(() => {
    const totalOffers = offers.length;
    const activeOffers = offers.filter(offer => offer.status === 'active').length;
    const expiredOffers = offers.filter(offer => offer.status === 'expired').length;
    
    // Calculate total discount given (actual amount given to customers)
    const totalDiscountGiven = offers.reduce((sum, offer) => {
      // Use the actual totalDiscountGiven field from the database
      // This represents the real cumulative discount amount given to customers
      return sum + (offer.totalDiscountGiven || 0);
    }, 0);
    
    // Calculate total usage
    const totalUsage = offers.reduce((sum, offer) => sum + (offer.totalUsage || 0), 0);
    
    // Calculate conversion rate (offers that have been used vs total offers)
    const usedOffers = offers.filter(offer => (offer.totalUsage || 0) > 0).length;
    const conversionRate = totalOffers > 0 ? (usedOffers / totalOffers) * 100 : 0;

    return [
      {
        label: 'Total Offers',
        value: totalOffers,
        icon: <Gift className="w-6 h-6 text-[#0a61d7]" />,
        color: 'bg-[#f7faff]',
        trend: { percent: '0%', label: 'from last month', up: true }
      },
      {
        label: 'Active Offers',
        value: activeOffers,
        icon: <TrendingUp className="w-6 h-6 text-green-500" />,
        color: 'bg-[#e6f7ec]',
        trend: { percent: '0%', label: 'from last month', up: true }
      },
      {
        label: 'Conversion Rate',
        value: `${conversionRate.toFixed(1)}%`,
        icon: <Percent className="w-6 h-6 text-orange-500" />,
        color: 'bg-[#fff7ed]',
        trend: { percent: `${usedOffers}/${totalOffers}`, label: 'offers used', up: conversionRate > 50 }
      },
      {
        label: 'Total Redemptions',
        value: totalUsage,
        icon: <Users className="w-6 h-6 text-purple-500" />,
        color: 'bg-[#f3f0ff]',
        trend: { percent: totalUsage > 0 ? 'Active' : 'No usage', label: 'redemption status', up: totalUsage > 0 }
      }
    ];
  }, [offers, userCurrency]);

  return (
    <div className="w-full mx-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map((stat, idx) => (
        <div
          key={stat.label}
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
          <div className="flex items-center gap-2 mt-4 ml-1">
            {stat.trend.up ? (
              <TrendingUp className="w-5 h-5 text-[#3ea73b]" />
            ) : (
              <TrendingDown className="w-5 h-5 text-[#f65911]" />
            )}
            <span className={stat.trend.up ? "text-[#3ea73b] text-xs font-semibold" : "text-[#f65911] text-xs font-semibold"}>
              {stat.trend.percent}
            </span>
            <span className="text-gray-400 text-xs">{stat.trend.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

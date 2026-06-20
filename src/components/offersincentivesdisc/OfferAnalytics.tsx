'use client';

import React from 'react';
import { BarChart3, TrendingUp, TrendingDown, Users, Calendar, Target, PieChart, Percent } from 'lucide-react';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';
import { useUserStore } from '@/store/userStore';
import { useOffersTranslations } from '@/hooks/useOffersTranslations';
import { Offer } from '@/types/offer';
import { Order } from '@/types/order';

// This function is no longer needed - we use actual data from offer.totalDiscountGiven

interface OfferAnalyticsProps {
  offers?: Offer[];
  orders?: Order[];
  isNewOffer?: boolean;
}

interface AnalyticsData {
  totalOffers: number;
  totalDiscountGiven: number;
  totalRedemptions: number;
  redemptionRate: number;
  conversionRate: number;
  redemptionTrends: Array<{
    period: string;
    redemptions: number;
    discountGiven: number;
  }>;
  offerTypeBreakdown: {
    discounts: number;
    promotions: number;
  };
}

export default function OfferAnalytics({ offers = [], orders = [], isNewOffer = false }: OfferAnalyticsProps) {
  const { tAnalytics } = useOffersTranslations();
  const user = useUserStore(state => state.user);
  const userCurrency = user?.currency || getDefaultCurrency();

  // Calculate analytics data from offers and orders (following the same pattern as other analytics components)
  const analyticsData = React.useMemo(() => {
    if (!offers || offers.length === 0) {
      return null;
    }

    const totalOffers = offers.length;
    
    // Calculate from offer data (already aggregated in database)
    const totalDiscountGiven = offers.reduce((sum, offer) => {
      return sum + (offer.totalDiscountGiven || 0);
    }, 0);
    
    const totalUsage = offers.reduce((sum, offer) => sum + (offer.totalUsage || 0), 0);
    
    // Calculate redemption rate (average redemptions per offer)
    // This shows how many times on average each offer has been used
    const redemptionRate = totalOffers > 0 ? (totalUsage / totalOffers) : 0;
    
    // Calculate conversion rate (offers that have been used vs total offers)
    const usedOffers = offers.filter(offer => (offer.totalUsage || 0) > 0).length;
    const conversionRate = totalOffers > 0 ? (usedOffers / totalOffers) * 100 : 0;


    // Calculate redemption trends (show current month and future months)
    const now = new Date();
    const monthlyTrends = [];
    
    // Generate current month and next 3 months
    for (let i = 0; i <= 3; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const monthName = date.toLocaleDateString('en-US', { month: 'long' });
      const year = date.getFullYear();
      const periodLabel = `${monthName} ${year}`;
      
      // For current month (i=0), show actual data; for future months, show 0
      const isCurrentMonth = i === 0;
      const redemptions = isCurrentMonth ? totalUsage : 0;
      const discountGiven = isCurrentMonth ? totalDiscountGiven : 0;
      
      monthlyTrends.push({
        period: periodLabel,
        redemptions,
        discountGiven,
      });
    }

    // Calculate offer type breakdown
    const discountOffers = offers.filter(offer => offer.type.includes('discount')).length;
    const promotionOffers = offers.filter(offer => offer.type.includes('promotion')).length;
    const total = discountOffers + promotionOffers;
    
    const offerTypeBreakdown = {
      discounts: total > 0 ? Math.round((discountOffers / total) * 100) : 0,
      promotions: total > 0 ? Math.round((promotionOffers / total) * 100) : 0,
    };

    return {
      totalOffers,
      totalDiscountGiven,
      totalRedemptions: totalUsage,
      redemptionRate,
      conversionRate,
      redemptionTrends: monthlyTrends,
      offerTypeBreakdown,
    };
  }, [offers]);

  // Empty state for new offers or no data
  if (isNewOffer || !analyticsData) {
    return (
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-black">{tAnalytics('title')}</h2>
            <p className="text-gray-500 text-sm">{tAnalytics('subtitleNew')}</p>
          </div>
        </div>

        {/* Empty State */}
        <div className="bg-white border border-[#e6e6e6] rounded-lg p-8 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <BarChart3 className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">{tAnalytics('emptyTitle')}</h3>
          <p className="text-gray-500 text-sm mb-4">
            {tAnalytics('emptyDescription')}
          </p>
          <div className="text-xs text-gray-400">
            {tAnalytics('emptyHint')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-black">{tAnalytics('title')}</h2>
          <p className="text-gray-500 text-sm">{tAnalytics('subtitle')}</p>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="w-full mx-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="flex flex-col justify-between p-4 rounded-lg bg-white border border-[#e6e6e6] bg-[#f7faff]">
          <div className="flex items-center gap-4 border-b border-[#e6e6e6] pb-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-white">
              <Target className="w-6 h-6 text-[#0a61d7]" />
            </div>
            <div>
              <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{tAnalytics('totalOffers')}</div>
              <div className="text-xl font-bold text-black">{analyticsData.totalOffers}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 ml-1">
            <TrendingUp className="w-5 h-5 text-[#3ea73b]" />
            <span className="text-[#3ea73b] text-xs font-semibold">
              {analyticsData.totalOffers > 0 ? tAnalytics('active') : '0'}
            </span>
            <span className="text-gray-400 text-xs">{tAnalytics('offersCreated')}</span>
          </div>
        </div>

        <div className="flex flex-col justify-between p-4 rounded-lg bg-white border border-[#e6e6e6] bg-[#fff7ed]">
          <div className="flex items-center gap-4 border-b border-[#e6e6e6] pb-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-white">
              <Percent className="w-6 h-6 text-orange-500" />
            </div>
            <div>
              <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{tAnalytics('conversionRate')}</div>
              <div className="text-xl font-bold text-black">
                {analyticsData.conversionRate.toFixed(1)}%
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 ml-1">
            <TrendingUp className="w-5 h-5 text-[#3ea73b]" />
            <span className="text-[#3ea73b] text-xs font-semibold">
              {analyticsData.conversionRate > 0 ? tAnalytics('active') : tAnalytics('noUsage')}
            </span>
            <span className="text-gray-400 text-xs">{tAnalytics('offersConverted')}</span>
          </div>
        </div>

        <div className="flex flex-col justify-between p-4 rounded-lg bg-white border border-[#e6e6e6] bg-[#f3f0ff]">
          <div className="flex items-center gap-4 border-b border-[#e6e6e6] pb-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-white">
              <Users className="w-6 h-6 text-purple-500" />
            </div>
            <div>
              <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{tAnalytics('totalRedemptions')}</div>
              <div className="text-xl font-bold text-black">{analyticsData.totalRedemptions}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 ml-1">
            <TrendingUp className="w-5 h-5 text-[#3ea73b]" />
            <span className="text-[#3ea73b] text-xs font-semibold">
              {analyticsData.totalRedemptions > 0 ? tAnalytics('active') : tAnalytics('noUsage')}
            </span>
            <span className="text-gray-400 text-xs">{tAnalytics('redemptionStatus')}</span>
          </div>
        </div>

        <div className="flex flex-col justify-between p-4 rounded-lg bg-white border border-[#e6e6e6] bg-[#e6f7ec]">
          <div className="flex items-center gap-4 border-b border-[#e6e6e6] pb-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-white">
              <TrendingUp className="w-6 h-6 text-green-500" />
            </div>
            <div>
              <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{tAnalytics('redemptionRate')}</div>
              <div className="text-xl font-bold text-black">{analyticsData.redemptionRate.toFixed(1)}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 ml-1">
            <TrendingUp className="w-5 h-5 text-[#3ea73b]" />
            <span className="text-[#3ea73b] text-xs font-semibold">
              {analyticsData.redemptionRate > 0 ? tAnalytics('active') : '0.0'}
            </span>
            <span className="text-gray-400 text-xs">{tAnalytics('avgPerOffer')}</span>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monthly Redemption Trends Chart */}
        <div className="bg-white p-4 rounded-lg border border-[#e6e6e6]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-black">{tAnalytics('monthlyTrends')}</h3>
            <BarChart3 className="w-5 h-5 text-gray-400" />
          </div>
          <div className="space-y-3">
            {analyticsData.redemptionTrends.map((trend, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700">{trend.period}</span>
                    <span className="text-sm text-gray-500">{tAnalytics('redemptionsCount', { count: trend.redemptions })}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-[#0a61d7] h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(trend.redemptions / 70) * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Offer Type Breakdown */}
        <div className="bg-white p-4 rounded-lg border border-[#e6e6e6]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-black">{tAnalytics('typeBreakdown')}</h3>
            <PieChart className="w-5 h-5 text-gray-400" />
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 bg-blue-500 rounded"></div>
                <span className="text-sm font-medium text-gray-700">{tAnalytics('discounts')}</span>
              </div>
              <span className="text-sm font-semibold text-gray-900">{analyticsData.offerTypeBreakdown.discounts}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${analyticsData.offerTypeBreakdown.discounts}%` }}
              ></div>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 bg-purple-500 rounded"></div>
                <span className="text-sm font-medium text-gray-700">{tAnalytics('promotions')}</span>
              </div>
              <span className="text-sm font-semibold text-gray-900">{analyticsData.offerTypeBreakdown.promotions}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${analyticsData.offerTypeBreakdown.promotions}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

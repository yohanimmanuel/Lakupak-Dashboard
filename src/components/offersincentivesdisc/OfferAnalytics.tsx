'use client';

import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, TrendingDown, Users, DollarSign, Calendar, Target, PieChart } from 'lucide-react';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';
import { useUserStore } from '@/store/userStore';
import { Offer } from '@/types/offer';

// Calculate total discount from all active discount types
function calculateTotalDiscountFromOffer(offer: Offer): number {
  if (!offer.discountTypes || offer.discountTypes.length === 0) {
    return 0;
  }

  const activeDiscountTypes = offer.discountTypes.filter(dt => dt.isActive);
  let totalDiscount = 0;

  activeDiscountTypes.forEach(dt => {
    if (dt.discountType === 'percentage') {
      // For percentage discounts, calculate based on minOrderValue
      const minOrderValue = dt.minOrderValue || offer.minOrderValue || 0;
      const numericMinOrderValue = typeof minOrderValue === 'string' ? parseFloat(minOrderValue) || 0 : minOrderValue;
      const discountAmount = (numericMinOrderValue * dt.discountValue) / 100;
      totalDiscount += discountAmount;
    } else if (dt.discountType === 'fixed') {
      // For fixed discounts, add the fixed amount
      totalDiscount += dt.discountValue;
    }
    // Note: buy_x_get_y discounts are more complex and would need order context
  });

  return totalDiscount;
}

interface OfferAnalyticsProps {
  offers?: Offer[];
  isNewOffer?: boolean;
}

interface AnalyticsData {
  totalOffers: number;
  activeOffers: number;
  totalDiscountGiven: number;
  totalRedemptions: number;
  avgDiscountPerOrder: number;
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

export default function OfferAnalytics({ offers = [], isNewOffer = false }: OfferAnalyticsProps) {
  const user = useUserStore(state => state.user);
  const userCurrency = user?.currency || getDefaultCurrency();
  const [selectedPeriod, setSelectedPeriod] = useState<'7d' | '30d' | '90d' | '1y'>('30d');

  // Calculate analytics data from offers
  const analyticsData = React.useMemo(() => {
    if (!offers || offers.length === 0) {
      return null;
    }

    // Filter offers based on selected period
    const now = new Date();
    let startDate: Date;
    
    switch (selectedPeriod) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const filteredOffers = offers.filter(offer => 
      new Date(offer.createdAt) >= startDate && new Date(offer.createdAt) <= now
    );

    const totalOffers = filteredOffers.length;
    const activeOffers = filteredOffers.filter(offer => offer.status === 'active').length;
    // Use real totalDiscountGiven from offers (tracked from actual orders)
    const totalDiscountGiven = filteredOffers.reduce((sum, offer) => {
      return sum + (offer.totalDiscountGiven || 0);
    }, 0);
    const totalUsage = filteredOffers.reduce((sum, offer) => sum + (offer.totalUsage || 0), 0);
    const avgDiscountPerOrder = totalUsage > 0 ? totalDiscountGiven / totalUsage : 0;


    // Calculate redemption trends (weekly data)
    const weeklyTrends = [];
    const weeksBack = selectedPeriod === '7d' ? 1 : selectedPeriod === '30d' ? 4 : selectedPeriod === '90d' ? 12 : 52;
    
    for (let i = 0; i < weeksBack; i++) {
      const weekStart = new Date(startDate.getTime() + i * 7 * 24 * 60 * 60 * 1000);
      const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      const weekOffers = filteredOffers.filter(offer => 
        new Date(offer.createdAt) >= weekStart && new Date(offer.createdAt) < weekEnd
      );
      
      const weekUsage = weekOffers.reduce((sum, offer) => sum + (offer.totalUsage || 0), 0);
      const weekDiscount = weekOffers.reduce((sum, offer) => sum + (offer.totalDiscountGiven || 0), 0);
      
      weeklyTrends.push({
        period: `Week ${i + 1}`,
        redemptions: weekUsage,
        discountGiven: weekDiscount,
      });
    }

    // Calculate offer type breakdown
    const discountOffers = filteredOffers.filter(offer => offer.type.includes('discount')).length;
    const promotionOffers = filteredOffers.filter(offer => offer.type.includes('promotion')).length;
    const total = discountOffers + promotionOffers;
    
    const offerTypeBreakdown = {
      discounts: total > 0 ? Math.round((discountOffers / total) * 100) : 0,
      promotions: total > 0 ? Math.round((promotionOffers / total) * 100) : 0,
    };

    return {
      totalOffers,
      activeOffers,
      totalDiscountGiven,
      totalRedemptions: totalUsage,
      avgDiscountPerOrder,
      redemptionTrends: weeklyTrends,
      offerTypeBreakdown,
    };
  }, [offers, selectedPeriod]);

  const periodOptions = [
    { value: '7d', label: 'Last 7 Days' },
    { value: '30d', label: 'Last 30 Days' },
    { value: '90d', label: 'Last 90 Days' },
    { value: '1y', label: 'Last Year' },
  ];

  // Empty state for new offers or no data
  if (isNewOffer || !analyticsData) {
    return (
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-black">Offer Analytics</h2>
            <p className="text-gray-500 text-sm">Analytics will be available after the offer is created and active</p>
          </div>
        </div>

        {/* Empty State */}
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <BarChart3 className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Analytics Yet</h3>
          <p className="text-gray-500 text-sm mb-4">
            Analytics data will appear here once your offer is created and starts receiving redemptions.
          </p>
          <div className="text-xs text-gray-400">
            You'll be able to track performance metrics, redemption trends, and offer effectiveness.
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
          <h2 className="text-xl font-bold text-black">Offer Analytics</h2>
          <p className="text-gray-500 text-sm">Track performance and optimize your offers</p>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="w-full mx-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="flex flex-col justify-between p-4 rounded-lg shadow bg-white border border-[#e6e6e6] bg-[#f7faff]">
          <div className="flex items-center gap-4 border-b border-gray-200 pb-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-white shadow-sm">
              <Target className="w-6 h-6 text-[#0a61d7]" />
            </div>
            <div>
              <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Total Offers</div>
              <div className="text-xl font-bold text-black">{analyticsData.totalOffers}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 ml-1">
            <TrendingUp className="w-5 h-5 text-[#3ea73b]" />
            <span className="text-[#3ea73b] text-xs font-semibold">+12%</span>
            <span className="text-gray-400 text-xs">from last month</span>
          </div>
        </div>

        <div className="flex flex-col justify-between p-4 rounded-lg shadow bg-white border border-[#e6e6e6] bg-[#e6f7ec]">
          <div className="flex items-center gap-4 border-b border-gray-200 pb-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-white shadow-sm">
              <TrendingUp className="w-6 h-6 text-green-500" />
            </div>
            <div>
              <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Active Offers</div>
              <div className="text-xl font-bold text-black">{analyticsData.activeOffers}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 ml-1">
            <TrendingUp className="w-5 h-5 text-[#3ea73b]" />
            <span className="text-[#3ea73b] text-xs font-semibold">75%</span>
            <span className="text-gray-400 text-xs">active rate</span>
          </div>
        </div>

        <div className="flex flex-col justify-between p-4 rounded-lg shadow bg-white border border-[#e6e6e6] bg-[#fff7ed]">
          <div className="flex items-center gap-4 border-b border-gray-200 pb-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-white shadow-sm">
              <DollarSign className="w-6 h-6 text-orange-500" />
            </div>
            <div>
              <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Total Discount Given</div>
              <div className="text-xl font-bold text-black">
                {formatCurrency(analyticsData.totalDiscountGiven, userCurrency)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 ml-1">
            <TrendingUp className="w-5 h-5 text-[#3ea73b]" />
            <span className="text-[#3ea73b] text-xs font-semibold">+18%</span>
            <span className="text-gray-400 text-xs">from last month</span>
          </div>
        </div>

        <div className="flex flex-col justify-between p-4 rounded-lg shadow bg-white border border-[#e6e6e6] bg-[#f3f0ff]">
          <div className="flex items-center gap-4 border-b border-gray-200 pb-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-white shadow-sm">
              <Users className="w-6 h-6 text-purple-500" />
            </div>
            <div>
              <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Total Redemptions</div>
              <div className="text-xl font-bold text-black">{analyticsData.totalRedemptions}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 ml-1">
            <TrendingUp className="w-5 h-5 text-[#3ea73b]" />
            <span className="text-[#3ea73b] text-xs font-semibold">+23%</span>
            <span className="text-gray-400 text-xs">from last month</span>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Redemption Trends Chart */}
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-black">Redemption Trends</h3>
            <BarChart3 className="w-5 h-5 text-gray-400" />
          </div>
          <div className="space-y-3">
            {analyticsData.redemptionTrends.map((trend, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700">{trend.period}</span>
                    <span className="text-sm text-gray-500">{trend.redemptions} redemptions</span>
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
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-black">Offer Type Breakdown</h3>
            <PieChart className="w-5 h-5 text-gray-400" />
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 bg-blue-500 rounded"></div>
                <span className="text-sm font-medium text-gray-700">Discounts</span>
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
                <span className="text-sm font-medium text-gray-700">Promotions</span>
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


      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 p-4 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Average Discount per Order</p>
              <p className="text-lg font-semibold text-black">
                {formatCurrency(analyticsData.avgDiscountPerOrder, userCurrency)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 p-4 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Redemption Rate</p>
              <p className="text-lg font-semibold text-black">78.5%</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 p-4 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <Target className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Conversion Rate</p>
              <p className="text-lg font-semibold text-black">24.3%</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

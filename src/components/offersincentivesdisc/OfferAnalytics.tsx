'use client';

import React, { useState } from 'react';
import { BarChart3, TrendingUp, TrendingDown, Users, DollarSign, Calendar, Target, PieChart } from 'lucide-react';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';
import { useUserStore } from '@/store/userStore';

interface OfferAnalyticsProps {
  isNewOffer?: boolean;
}

interface AnalyticsData {
  totalOffers: number;
  activeOffers: number;
  totalDiscountGiven: number;
  totalRedemptions: number;
  avgDiscountPerOrder: number;
  topPerformingOffers: Array<{
    name: string;
    redemptions: number;
    discountGiven: number;
    performance: number;
  }>;
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

export default function OfferAnalytics({ isNewOffer = false }: OfferAnalyticsProps) {
  const user = useUserStore(state => state.user);
  const userCurrency = user?.currency || getDefaultCurrency();
  const [selectedPeriod, setSelectedPeriod] = useState<'7d' | '30d' | '90d' | '1y'>('30d');

  // Mock data - replace with actual API calls
  const analyticsData: AnalyticsData = {
    totalOffers: 24,
    activeOffers: 18,
    totalDiscountGiven: 12500000,
    totalRedemptions: 456,
    avgDiscountPerOrder: 27412,
    topPerformingOffers: [
      { name: 'Summer Sale 2024', redemptions: 89, discountGiven: 1250000, performance: 95 },
      { name: 'Bulk Discount', redemptions: 67, discountGiven: 890000, performance: 87 },
      { name: 'New Customer Special', redemptions: 45, discountGiven: 675000, performance: 78 },
      { name: 'Volume Incentive', redemptions: 34, discountGiven: 520000, performance: 72 },
    ],
    redemptionTrends: [
      { period: 'Week 1', redemptions: 45, discountGiven: 1250000 },
      { period: 'Week 2', redemptions: 52, discountGiven: 1450000 },
      { period: 'Week 3', redemptions: 38, discountGiven: 980000 },
      { period: 'Week 4', redemptions: 61, discountGiven: 1670000 },
    ],
    offerTypeBreakdown: {
      discounts: 65,
      promotions: 35,
    }
  };

  const periodOptions = [
    { value: '7d', label: 'Last 7 Days' },
    { value: '30d', label: 'Last 30 Days' },
    { value: '90d', label: 'Last 90 Days' },
    { value: '1y', label: 'Last Year' },
  ];

  // Empty state for new offers
  if (isNewOffer) {
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

      {/* Top Performing Offers */}
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-black">Top Performing Offers</h3>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Calendar className="w-4 h-4" />
            Last 30 days
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Offer Name</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Redemptions</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Discount Given</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Performance</th>
              </tr>
            </thead>
            <tbody>
              {analyticsData.topPerformingOffers.map((offer, index) => (
                <tr key={index} className="text-xs border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-4 px-4">
                    <div className="font-medium text-black">{offer.name}</div>
                  </td>
                  <td className="py-4 px-4 text-gray-700">{offer.redemptions}</td>
                  <td className="py-4 px-4 text-gray-700">
                    {formatCurrency(offer.discountGiven, userCurrency)}
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-gray-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${
                            offer.performance >= 90 ? 'bg-green-500' :
                            offer.performance >= 80 ? 'bg-blue-500' :
                            offer.performance >= 70 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${offer.performance}%` }}
                        ></div>
                      </div>
                      <span className="text-sm font-medium text-gray-700">{offer.performance}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

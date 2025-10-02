'use client';

import React, { useState } from 'react';
import { BarChart3, TrendingUp, TrendingDown, Users, DollarSign, Calendar, Target, PieChart } from 'lucide-react';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';
import { useUserStore } from '@/store/userStore';

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

export default function OfferAnalytics() {
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

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-black">Offer Analytics</h2>
          <p className="text-gray-500 text-sm">Track performance and optimize your offers</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0a61d7]"
          >
            {periodOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-600 font-medium">Total Offers</p>
              <p className="text-2xl font-bold text-blue-800">{analyticsData.totalOffers}</p>
              <p className="text-xs text-blue-600">+12% from last month</p>
            </div>
            <Target className="w-8 h-8 text-blue-600" />
          </div>
        </div>

        <div className="bg-gradient-to-r from-green-50 to-green-100 p-4 rounded-lg border border-green-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-600 font-medium">Active Offers</p>
              <p className="text-2xl font-bold text-green-800">{analyticsData.activeOffers}</p>
              <p className="text-xs text-green-600">75% active rate</p>
            </div>
            <TrendingUp className="w-8 h-8 text-green-600" />
          </div>
        </div>

        <div className="bg-gradient-to-r from-orange-50 to-orange-100 p-4 rounded-lg border border-orange-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-orange-600 font-medium">Total Discount Given</p>
              <p className="text-2xl font-bold text-orange-800">
                {formatCurrency(analyticsData.totalDiscountGiven, userCurrency)}
              </p>
              <p className="text-xs text-orange-600">+18% from last month</p>
            </div>
            <DollarSign className="w-8 h-8 text-orange-600" />
          </div>
        </div>

        <div className="bg-gradient-to-r from-purple-50 to-purple-100 p-4 rounded-lg border border-purple-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-purple-600 font-medium">Total Redemptions</p>
              <p className="text-2xl font-bold text-purple-800">{analyticsData.totalRedemptions}</p>
              <p className="text-xs text-purple-600">+23% from last month</p>
            </div>
            <Users className="w-8 h-8 text-purple-600" />
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Redemption Trends Chart */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
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
        <div className="bg-white p-6 rounded-lg border border-gray-200">
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
      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <div className="flex items-center justify-between mb-6">
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
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 uppercase">Offer Name</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 uppercase">Redemptions</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 uppercase">Discount Given</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 uppercase">Performance</th>
              </tr>
            </thead>
            <tbody>
              {analyticsData.topPerformingOffers.map((offer, index) => (
                <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
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
        <div className="bg-gray-50 p-4 rounded-lg">
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

        <div className="bg-gray-50 p-4 rounded-lg">
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

        <div className="bg-gray-50 p-4 rounded-lg">
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

'use client';

import React, { useState } from 'react';
import { Gift, Plus, Calendar } from 'lucide-react';
import OfferStatCards from '@/components/offersincentivesdisc/OfferStatCards';
import OfferTable from '@/components/offersincentivesdisc/OfferTable';

interface Offer {
  id: string;
  offerId: string;
  name: string;
  description: string;
  type: 'discount' | 'promotion';
  status: 'active' | 'inactive' | 'expired';
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  minOrderValue?: number;
  minQuantity?: number;
  startDate: string;
  endDate: string;
  maxUsage?: number;
  perCustomerLimit?: number;
  totalUsage: number;
  totalDiscountGiven: number;
  createdAt: string;
  updatedAt: string;
}

export default function OffersPage() {
  const [activeTab, setActiveTab] = useState<'all' | 'discounts' | 'promotions'>('all');
  const [offers, setOffers] = useState<Offer[]>([]); // Will be populated from API

  // Sample data for demonstration
  React.useEffect(() => {
    setOffers([
      {
        id: '1',
        offerId: 'OFFER_001',
        name: 'Summer Sale 2024',
        description: 'Summer promotion for all beverages',
        type: 'promotion',
        status: 'active',
        discountType: 'percentage',
        discountValue: 15,
        minOrderValue: 100000,
        startDate: '2024-01-01',
        endDate: '2024-03-31',
        maxUsage: 1000,
        perCustomerLimit: 3,
        totalUsage: 245,
        totalDiscountGiven: 12500000,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-15T00:00:00Z'
      },
      {
        id: '2',
        offerId: 'OFFER_002',
        name: 'Bulk Discount',
        description: 'Volume discount for snacks category',
        type: 'discount',
        status: 'active',
        discountType: 'fixed',
        discountValue: 5000,
        minQuantity: 10,
        startDate: '2024-01-15',
        endDate: '2024-06-30',
        maxUsage: 500,
        totalUsage: 89,
        totalDiscountGiven: 445000,
        createdAt: '2024-01-15T00:00:00Z',
        updatedAt: '2024-01-20T00:00:00Z'
      }
    ]);
  }, []);

  const tabs = [
    { id: 'all', label: 'All Offers', count: offers.length },
    { id: 'discounts', label: 'Discounts', count: offers.filter(offer => offer.type === 'discount').length },
    { id: 'promotions', label: 'Promotions', count: offers.filter(offer => offer.type === 'promotion').length },
  ];

  const handleSelectOffer = (offer: Offer) => {
    // Handle offer selection - could open a modal or navigate to details
    console.log('Selected offer:', offer);
  };


  return (
    <div className="p-4 space-y-4 bg-gradient-to-b from-gray-50 to-white">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-black">Offers & Incentives</h1>
            <p className="text-gray-500 text-sm">Manage discounts and promotions for your products</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-gray-200 text-black font-medium hover:bg-gray-100 transition text-sm">
            <Calendar className="w-4 h-4" />
            Export
          </button>
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0a61d7] text-white font-semibold hover:bg-[#084ba6] transition text-sm">
            <Plus className="w-4 h-4" />
            Create Offer
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <OfferStatCards offers={offers} />

      {/* Tab Navigation */}
      <div className="bg-white rounded-lg border border-[#e6e6e6] p-1">
        <div className="flex flex-col sm:flex-row gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-[#0a61d7] text-white'
                  : 'text-gray-600 hover:text-black hover:bg-gray-50'
              }`}
            >
              {tab.label}
              <span className={`px-2 py-1 rounded-full text-xs ${
                activeTab === tab.id
                  ? 'bg-white/20 text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <OfferTable 
        offers={offers}
        setOffers={setOffers}
        activeTab={activeTab}
        onSelectOffer={handleSelectOffer}
      />
    </div>
  );
}
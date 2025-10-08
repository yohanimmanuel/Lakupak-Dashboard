'use client';

import React, { useState, useEffect } from 'react';
import { Gift, Plus, Calendar, Download } from 'lucide-react';
import OfferStatCards from '@/components/offersincentivesdisc/OfferStatCards';
import OfferTable from '@/components/offersincentivesdisc/OfferTable';
import { useRouter } from 'next/navigation';
import { Offer } from '@/types/offer';

export default function OffersPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'all' | 'discounts' | 'promotions'>('all');
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);


  // Fetch offers from API
  useEffect(() => {
    fetchOffers();
  }, []);

  const fetchOffers = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/offers');
      if (!response.ok) {
        throw new Error('Failed to fetch offers');
      }
      const data = await response.json();
      setOffers(data.offers || []);
    } catch (error) {
      setOffers([]);
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: 'all', label: 'All Offers', count: offers.length },
    { id: 'discounts', label: 'Discounts', count: offers.filter(offer => offer.type === 'discount').length },
    { id: 'promotions', label: 'Promotions', count: offers.filter(offer => offer.type === 'promotion').length },
  ];

  const handleSelectOffer = (offer: Offer) => {
    // Handle offer selection - could open a modal or navigate to details
  };

  const handleCreateOffer = () => {
    router.push('/offers/new');
  };

  const handleExportData = async () => {
    try {
      // TODO: Implement export functionality
    } catch (error) {
    }
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
          <button 
            onClick={handleExportData}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-gray-200 text-black font-medium hover:bg-gray-100 transition text-sm"
          >
            <Download className="w-4 h-4" />
            Export Data
          </button>
          <button 
            onClick={handleCreateOffer}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0a61d7] text-white font-semibold hover:bg-[#084ba6] transition text-sm"
          >
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
                  : 'text-gray-600 hover:text-black hover:bg-gray-100'
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

      {/* Loading State */}
      {loading && (
        <div className="bg-white rounded-lg border border-[#e6e6e6] p-8 text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-500">Loading offers...</p>
        </div>
      )}

      {/* Table */}
      {!loading && (
        <OfferTable 
          offers={offers}
          setOffers={setOffers}
          activeTab={activeTab}
          onSelectOffer={handleSelectOffer}
        />
      )}
    </div>
  );
}
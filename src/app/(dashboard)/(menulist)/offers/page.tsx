'use client';

import React, { useState, useEffect } from 'react';
import { Gift, Plus, Calendar, Download } from 'lucide-react';
import OfferStatCards from '@/components/offersincentivesdisc/OfferStatCards';
import OfferTable from '@/components/offersincentivesdisc/OfferTable';
import { useRouter } from 'next/navigation';
import { Offer } from '@/types/offer';
import { useUserStore } from '@/store/userStore';

export default function OffersPage() {
  const router = useRouter();
  const { user } = useUserStore();
  const [activeTab, setActiveTab] = useState<'all' | 'discounts' | 'promotions'>('all');
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);


  // Fetch offers from API
  useEffect(() => {
    fetchOffers();
  }, [user?.id]);

  const fetchOffers = async () => {
    try {
      setLoading(true);
      if (!user?.id) {
        setOffers([]);
        return;
      }
      
      const response = await fetch(`/api/offers?userId=${user.id}`);
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

  // Helper function to check if offer has discount types
  const hasDiscountType = (offer: Offer) => {
    const activeDiscountTypes = offer.discountTypes?.filter(dt => dt.isActive) || [];
    return activeDiscountTypes.some(dt => dt.discountType === 'percentage' || dt.discountType === 'fixed');
  };

  // Helper function to check if offer has promotion types
  const hasPromotionType = (offer: Offer) => {
    const activeDiscountTypes = offer.discountTypes?.filter(dt => dt.isActive) || [];
    return activeDiscountTypes.some(dt => dt.discountType === 'buy_x_get_y');
  };

  const tabs = [
    { id: 'all', label: 'All Offers', count: offers.length },
    { id: 'discounts', label: 'Discounts', count: offers.filter(offer => offer.type.includes('discount') || hasDiscountType(offer)).length },
    { id: 'promotions', label: 'Promotions', count: offers.filter(offer => offer.type.includes('promotion') || hasPromotionType(offer)).length },
  ];

  const handleSelectOffer = (offer: Offer) => {
    // Handle offer selection - could open a modal or navigate to details
  };

  const handleCreateOffer = () => {
    router.push('/offers/new');
  };

  const handleExportData = async () => {
    try {
      if (offers.length === 0) {
        alert('No offers to export');
        return;
      }

      // Import xlsx library dynamically
      const XLSX = await import('xlsx');

      // Prepare data for Excel
      const exportData = offers.map(offer => {
        const discountTypesSummary = offer.discountTypes
          ?.map(dt => `${dt.discountType}(${dt.discountValue}${dt.discountType === 'percentage' ? '%' : ''})`)
          .join('; ') || 'N/A';

        return {
          'Offer ID': offer.offerId || offer.id,
          'Name': offer.name || 'N/A',
          'Type': Array.isArray(offer.type) ? offer.type.join(', ') : offer.type || 'N/A',
          'Status': offer.status || 'N/A',
          'Start Date': offer.startDate ? new Date(offer.startDate).toLocaleDateString() : 'N/A',
          'End Date': offer.endDate ? new Date(offer.endDate).toLocaleDateString() : 'N/A',
          'Products Count': offer.products?.length || 0,
          'Total Usage': offer.totalUsage || 0,
          'Total Discount Given': offer.totalDiscountGiven || 0,
          'Discount Types': discountTypesSummary,
          'Created At': offer.createdAt ? new Date(offer.createdAt).toLocaleDateString() : 'N/A'
        };
      });

      // Create worksheet
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      
      // Set column widths
      const columnWidths = [
        { wch: 15 }, // Offer ID
        { wch: 30 }, // Name
        { wch: 15 }, // Type
        { wch: 10 }, // Status
        { wch: 15 }, // Start Date
        { wch: 15 }, // End Date
        { wch: 15 }, // Products Count
        { wch: 12 }, // Total Usage
        { wch: 20 }, // Total Discount Given
        { wch: 40 }, // Discount Types
        { wch: 15 }  // Created At
      ];
      worksheet['!cols'] = columnWidths;

      // Create workbook
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Offers');

      // Generate Excel file and download
      XLSX.writeFile(workbook, `offers_export_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (error) {
      alert('Failed to export data. Please try again.');
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
              onClick={() => setActiveTab(tab.id as 'all' | 'discounts' | 'promotions')}
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
          setOffersAction={setOffers}
          activeTab={activeTab}
          onSelectOfferAction={handleSelectOffer}
        />
      )}
    </div>
  );
}
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Gift, Plus, Calendar, Download } from 'lucide-react';
import OfferStatCards from '@/components/offersincentivesdisc/OfferStatCards';
import OfferTable from '@/components/offersincentivesdisc/OfferTable';
import { useRouter } from 'next/navigation';
import { Offer } from '@/types/offer';
import { useUserStore } from '@/store/userStore';
import { fetchGraphQL } from '@/lib/graphqlClient';

export default function OffersPage() {
  const router = useRouter();
  const { user } = useUserStore();
  const [activeTab, setActiveTab] = useState<'all' | 'discounts' | 'promotions'>('all');
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);

  // GraphQL query to fetch offers - moved outside component to prevent recreation on every render
  const OFFERS_QUERY = `
    query GetOffers($userId: Int!, $page: Int, $limit: Int, $status: String, $type: String) {
      offers(userId: $userId, page: $page, limit: $limit, status: $status, type: $type) {
        nodes {
          id
          offerId
          name
          description
          type
          status
          totalUsage
          totalDiscountGiven
          discountTypes {
            id
            discountType
            discountValue
            minOrderValue
            minQuantity
            isActive
            priority
          }
          dateRanges {
            id
            name
            description
            startDate
            endDate
            isActive
            createdAt
            updatedAt
          }
        }
        pagination {
          totalCount
        }
      }
    }
  `;

  // Fetch offers from GraphQL API
  const fetchOffers = useCallback(async () => {
    try {
      setLoading(true);
      if (!user?.id) {
        setOffers([]);
        setLoading(false);
        return;
      }
      
      const data = await fetchGraphQL<{
        offers: {
          nodes: Array<{
            id: string;
            offerId: string;
            name: string;
            description: string | null;
            type: string[];
            status: string;
            totalUsage: number;
            totalDiscountGiven: number;
            discountTypes: Array<{
              id: string;
              discountType: string;
              discountValue: number;
              minOrderValue: number | null;
              minQuantity: number | null;
              isActive: boolean;
              priority: number;
            }>;
            dateRanges: Array<{
              id: string;
              name: string;
              description: string | null;
              startDate: string;
              endDate: string;
              isActive: boolean;
              createdAt: string;
              updatedAt: string;
            }>;
          }>;
          pagination: {
            totalCount: number;
          };
        };
      }>(OFFERS_QUERY, {
        userId: user.id,
        page: 1,
        limit: 1000, // Fetch all offers for the offers page
      });

      // Transform GraphQL response to match Offer type
      const transformedOffers: Offer[] = data.offers.nodes.map((offer) => {
        // Calculate startDate and endDate from dateRanges
        // Use earliest startDate and latest endDate from active date ranges
        let calculatedStartDate = new Date().toISOString();
        let calculatedEndDate = new Date().toISOString();
        
        if (offer.dateRanges && offer.dateRanges.length > 0) {
          const activeDateRanges = offer.dateRanges.filter(dr => dr.isActive);
          if (activeDateRanges.length > 0) {
            const startDates = activeDateRanges.map(dr => new Date(dr.startDate).getTime());
            const endDates = activeDateRanges.map(dr => new Date(dr.endDate).getTime());
            calculatedStartDate = new Date(Math.min(...startDates)).toISOString();
            calculatedEndDate = new Date(Math.max(...endDates)).toISOString();
          } else {
            // If no active date ranges, use all date ranges
            const startDates = offer.dateRanges.map(dr => new Date(dr.startDate).getTime());
            const endDates = offer.dateRanges.map(dr => new Date(dr.endDate).getTime());
            calculatedStartDate = new Date(Math.min(...startDates)).toISOString();
            calculatedEndDate = new Date(Math.max(...endDates)).toISOString();
          }
        }
        
        return {
          id: offer.id,
          offerId: offer.offerId,
          name: offer.name,
          description: offer.description || undefined,
          type: offer.type as ('discount' | 'promotion')[],
          status: offer.status as 'active' | 'expired' | 'inactive',
          startDate: calculatedStartDate,
          endDate: calculatedEndDate,
          totalUsage: offer.totalUsage,
          totalDiscountGiven: offer.totalDiscountGiven,
          discountTypes: offer.discountTypes.map((dt) => ({
            id: dt.id,
            discountType: dt.discountType as 'percentage' | 'fixed' | 'buy_x_get_y',
            discountValue: dt.discountValue,
            minOrderValue: dt.minOrderValue || undefined,
            minQuantity: dt.minQuantity || undefined,
            isActive: dt.isActive,
            priority: dt.priority,
          })),
          dateRanges: offer.dateRanges?.map((dr) => ({
            id: dr.id,
            name: dr.name,
            description: dr.description || undefined,
            startDate: dr.startDate,
            endDate: dr.endDate,
            isActive: dr.isActive,
            createdAt: dr.createdAt,
            updatedAt: dr.updatedAt,
          })),
          products: [], // Products are not included in the offers query
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      });

      setOffers(transformedOffers);
    } catch (error) {
      console.error('Failed to fetch offers:', error);
      setOffers([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]); // Removed OFFERS_QUERY from deps - it's a constant and shouldn't cause re-renders

  useEffect(() => {
    let ignore = false;
    
    const loadOffers = async () => {
      await fetchOffers();
    };
    
    loadOffers();
    
    return () => {
      ignore = true;
    };
  }, [fetchOffers]);

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

  if (loading) {
    return (
      <div className="w-full mx-auto p-4 bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[#0a61d7] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading offers...</p>
        </div>
      </div>
    );
  }

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
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-[#e6e6e6] text-black font-medium hover:bg-gray-100 transition text-sm"
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

      {/* Table */}
        <OfferTable 
          offers={offers}
          setOffersAction={setOffers}
          activeTab={activeTab}
          onSelectOfferAction={handleSelectOffer}
        />
    </div>
  );
}
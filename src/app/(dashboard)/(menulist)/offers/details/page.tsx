'use client';

import React, { useState, useEffect } from 'react';
import { ArrowLeft, BarChart3, Target, Package, Calendar } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import OfferAnalytics from '@/components/offersincentivesdisc/OfferAnalytics';
import OfferType from '@/components/offersincentivesdisc/OfferType';
import ProductIntegration from '@/components/offersincentivesdisc/ProductIntegration';
import RangeManagement from '@/components/offersincentivesdisc/RangeManagement';
import { Offer } from '@/types/offer';

export default function OffersDetailsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<'analytics' | 'type' | 'products' | 'range'>('type');
  const [offers, setOffers] = useState<Offer[]>([]);
  const [currentOffer, setCurrentOffer] = useState<Offer | null>(null);
  const [loading, setLoading] = useState(true);

  // Get offer ID from URL params
  const offerId = searchParams.get('id');

  // Fetch offers and current offer from API
  useEffect(() => {
    fetchOffers();
  }, []);

  useEffect(() => {
    if (offerId && offers.length > 0) {
      const offer = offers.find(o => o.id === offerId);
      if (offer) {
        // Extract product offer badges from offerProducts
        const productOfferBadges: Record<string, string> = {};
        offer.products?.forEach((product: any) => {
          if (product.productId) {
            // Determine badge based on discount types
            const hasDiscount = offer.discountTypes?.some((dt: any) => dt.discountType === 'percentage' || dt.discountType === 'fixed');
            const hasPromotion = offer.discountTypes?.some((dt: any) => dt.discountType === 'buy_x_get_y');
            if (hasDiscount && hasPromotion) {
              productOfferBadges[product.productId] = 'All Offers';
            } else if (hasPromotion) {
              productOfferBadges[product.productId] = 'Promotion';
            } else if (hasDiscount) {
              productOfferBadges[product.productId] = 'Discount';
            } else {
              productOfferBadges[product.productId] = 'Offer';
            }
          }
        });
        
        // Add productOfferBadges to the offer data
        const offerWithBadges = {
          ...offer,
          productOfferBadges
        };
        
        setCurrentOffer(offerWithBadges);
      } else {
        setCurrentOffer(null);
      }
      setLoading(false);
    } else if (offers.length > 0 && !offerId) {
      // If no specific offer ID, show the first offer
      const firstOffer = offers[0];
      // Extract product offer badges from offerProducts
      const productOfferBadges: Record<string, string> = {};
      firstOffer.products?.forEach((product: any) => {
        if (product.productId) {
          // Determine badge based on discount types
          const hasDiscount = firstOffer.discountTypes?.some((dt: any) => dt.discountType === 'percentage' || dt.discountType === 'fixed');
          const hasPromotion = firstOffer.discountTypes?.some((dt: any) => dt.discountType === 'buy_x_get_y');
          if (hasDiscount && hasPromotion) {
            productOfferBadges[product.productId] = 'All Offers';
          } else if (hasPromotion) {
            productOfferBadges[product.productId] = 'Promotion';
          } else if (hasDiscount) {
            productOfferBadges[product.productId] = 'Discount';
          } else {
            productOfferBadges[product.productId] = 'Offer';
          }
        }
      });
      
      // Add productOfferBadges to the offer data
      const offerWithBadges = {
        ...firstOffer,
        productOfferBadges
      };
      
      setCurrentOffer(offerWithBadges);
      setLoading(false);
    }
  }, [offers, offerId]);

  const fetchOffers = async () => {
    try {
      const response = await fetch('/api/offers');
      if (!response.ok) {
        throw new Error('Failed to fetch offers');
      }
      const data = await response.json();
      setOffers(data.offers || []);
    } catch (error) {
      setOffers([]);
      setLoading(false);
    }
  };

  const tabs = [
    { 
      id: 'type', 
      label: 'Offer Type', 
      icon: <Target className="w-5 h-5" />,
      description: 'Discount types and rules'
    },
    { 
      id: 'range', 
      label: 'Date Range', 
      icon: <Calendar className="w-5 h-5" />,
      description: 'Time periods and scheduling'
    },
    { 
      id: 'products', 
      label: 'Products', 
      icon: <Package className="w-5 h-5" />,
      description: 'Product selection and targeting'
    },
    { 
      id: 'analytics', 
      label: 'Analytics', 
      icon: <BarChart3 className="w-5 h-5" />,
      description: 'Performance metrics analysis'
    },
  ];

  const renderActiveComponent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      );
    }

    if (!currentOffer) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <p className="text-gray-500">No offer selected or found.</p>
            <button
              onClick={() => router.push('/offers')}
              className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Back to Offers
            </button>
          </div>
        </div>
      );
    }

    switch (activeTab) {
      case 'analytics':
        return <OfferAnalytics offers={[currentOffer]} />;
      case 'type':
        return <OfferType offerData={currentOffer} />;
      case 'products':
        // Provide no-op handlers to satisfy props; details page is read-only
        return (
          <ProductIntegration 
            offerData={currentOffer}
            onAddProduct={() => {}}
            onRemoveProduct={() => {}}
            onUpdateProductDiscount={() => {}}
          />
        );
      case 'range':
        return <RangeManagement offerData={currentOffer} />;
      default:
        return <OfferType offerData={currentOffer} />;
    }
  };

  return (
    <div className="p-4 space-y-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-black hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div>
            <h1 className="text-2xl font-bold text-black">Offers & Incentives</h1>
            <p className="text-gray-500 text-sm">Advanced offer management and analytics</p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white rounded-lg border border-[#e6e6e6] p-1">
        <div className="flex flex-col lg:flex-row gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium transition-colors flex-1 justify-center ${
                activeTab === tab.id
                  ? 'bg-[#0a61d7] text-white'
                  : 'text-gray-600 hover:text-black hover:bg-gray-100'
              }`}
            >
              {tab.icon}
              <div className="text-left">
                <div>{tab.label}</div>
                <div className={`text-xs ${
                  activeTab === tab.id ? 'text-white/80' : 'text-gray-400'
                }`}>
                  {tab.description}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <div className="bg-white rounded-lg border border-[#e6e6e6] shadow-sm">
        {renderActiveComponent()}
      </div>
    </div>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import { ArrowLeft, BarChart3, Target, Package, Calendar, Save, X, CheckCircle, ChevronDown } from 'lucide-react';
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
  const [originalOffer, setOriginalOffer] = useState<Offer | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);

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
        setOriginalOffer(JSON.parse(JSON.stringify(offerWithBadges))); // Deep clone
      } else {
        setCurrentOffer(null);
        setOriginalOffer(null);
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
      setOriginalOffer(JSON.parse(JSON.stringify(offerWithBadges))); // Deep clone
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

  // Handle changes from child components
  const handleOfferChange = (updatedData: Partial<Offer>) => {
    if (currentOffer) {
      setCurrentOffer({ ...currentOffer, ...updatedData });
      setHasUnsavedChanges(true);
    }
  };

  // Save all changes
  const handleSave = async () => {
    if (!currentOffer || !hasUnsavedChanges) return;

    setIsSaving(true);
    try {
      const payload = {
        discountTypes: currentOffer.discountTypes,
        dateRanges: currentOffer.dateRanges,
        timeSlots: currentOffer.timeSlots,
        products: currentOffer.products,
        status: currentOffer.status,
      };
      
      const response = await fetch(`/api/offers/${currentOffer.id}?type=batch-update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || errorData.error || 'Failed to save changes');
      }

      // Refresh offers from server
      await fetchOffers();
      setHasUnsavedChanges(false);
      
      // Show success modal for 3 seconds
      setShowSuccessModal(true);
      setTimeout(() => {
        setShowSuccessModal(false);
      }, 3000);
    } catch (error) {
      alert(`Failed to save changes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Cancel changes
  const handleCancel = () => {
    if (originalOffer) {
      setCurrentOffer(JSON.parse(JSON.stringify(originalOffer)));
      setHasUnsavedChanges(false);
    }
  };

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

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
        return <OfferType offerData={currentOffer} onOfferChange={handleOfferChange} />;
      case 'products':
        return (
          <ProductIntegration 
            offerData={currentOffer}
            onOfferChange={handleOfferChange}
            onAddProduct={() => {}}
            onRemoveProduct={() => {}}
            onUpdateProductDiscount={() => {}}
          />
        );
      case 'range':
        return <RangeManagement offerData={currentOffer} onOfferChange={handleOfferChange} />;
      default:
        return <OfferType offerData={currentOffer} onOfferChange={handleOfferChange} />;
    }
  };

  return (
    <div className="p-4 space-y-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              if (hasUnsavedChanges) {
                if (confirm('You have unsaved changes. Are you sure you want to leave?')) {
                  router.back();
                }
              } else {
                router.back();
              }
            }}
            className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-black hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div>
            <h1 className="text-2xl font-bold text-black">
              {currentOffer?.name || 'Offers & Incentives'}
            </h1>
            <p className="text-gray-500 text-sm">
              Advanced offer management and analytics
              {hasUnsavedChanges && <span className="ml-2 text-orange-600 font-medium">• Unsaved changes</span>}
            </p>
          </div>
        </div>
        
        {/* Save/Cancel Buttons with Status Toggle */}
        <div className="flex items-center gap-2">
          {/* Status Toggle */}
          {currentOffer && (
            <div className="relative">
              <button
                className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-100 text-sm"
                onClick={() => setShowStatusDropdown(!showStatusDropdown)}
              >
                {currentOffer.status.charAt(0).toUpperCase() + currentOffer.status.slice(1)}
                <ChevronDown className="w-4 h-4 ml-1 text-gray-500" />
              </button>
              {showStatusDropdown && (
                <div className="absolute right-0 mt-2 w-32 bg-white border border-gray-200 rounded-lg shadow z-20">
                  <button
                    onClick={() => {
                      handleOfferChange({ status: 'active' });
                      setShowStatusDropdown(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm first:rounded-t-lg last:rounded-b-lg ${
                      currentOffer.status === 'active'
                        ? 'text-[#0a61d7] font-semibold hover:bg-gray-100'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    Active
                  </button>
                  <button
                    onClick={() => {
                      handleOfferChange({ status: 'inactive' });
                      setShowStatusDropdown(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm first:rounded-t-lg last:rounded-b-lg ${
                      currentOffer.status === 'inactive'
                        ? 'text-[#0a61d7] font-semibold hover:bg-gray-100'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    Inactive
                  </button>
                </div>
              )}
            </div>
          )}
          <button
            onClick={handleCancel}
            disabled={!hasUnsavedChanges || isSaving}
            className="flex items-center gap-2 text-sm px-4 py-2 text-gray-600 hover:text-black hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-gray-300"
          >
            <X className="w-4 h-4" />
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!hasUnsavedChanges || isSaving}
            className="flex items-center gap-2 text-sm px-4 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#084ba6] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
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

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div className="bg-green-600 text-white rounded-lg shadow-2xl p-4 flex items-center gap-4 animate-fade-in pointer-events-auto">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <CheckCircle className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-md font-semibold">Changes Saved Successfully!</h3>
              <p className="text-xs text-white/90">All your changes have been saved to the database.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

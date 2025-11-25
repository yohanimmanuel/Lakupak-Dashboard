'use client';

import React, { useState, useEffect } from 'react';
import { ArrowLeft, BarChart3, Target, Package, Calendar, Save, X, CheckCircle, ChevronDown } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUserStore } from '@/store/userStore';
import OfferAnalytics from '@/components/offersincentivesdisc/OfferAnalytics';
import OfferType from '@/components/offersincentivesdisc/OfferType';
import ProductIntegration from '@/components/offersincentivesdisc/ProductIntegration';
import RangeManagement from '@/components/offersincentivesdisc/RangeManagement';
import { Offer } from '@/types/offer';
import { OfferDiscountType } from '@/types/offer';
import { OfferProduct } from '@/types/offer';
import { fetchGraphQL } from '@/lib/graphqlClient';

export default function OffersDetailsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useUserStore();
  const [activeTab, setActiveTab] = useState<'analytics' | 'type' | 'products' | 'range'>('type');
  const [currentOffer, setCurrentOffer] = useState<Offer | null>(null);
  const [originalOffer, setOriginalOffer] = useState<Offer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);

  // Get offer ID from URL params
  const offerId = searchParams.get('id');

  // GraphQL query to fetch a single offer
  const OFFER_QUERY = `
    query GetOffer($userId: Int!, $id: String!) {
      offer(userId: $userId, id: $id) {
        id
        offerId
        name
        description
        type
        status
        startDate
        endDate
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
        products {
          productId
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
        timeSlots {
          id
          name
          description
          startTime
          endTime
          days
          isActive
          createdAt
          updatedAt
        }
      }
    }
  `;

  // Fetch specific offer by ID using GraphQL
  useEffect(() => {
    const fetchOffer = async () => {
      if (!user?.id || !offerId) return;
      
      try {
        setLoading(true);
        setError(null);
        
        const data = await fetchGraphQL<{
          offer: {
            id: string;
            offerId: string;
            name: string;
            description: string | null;
            type: string[];
            status: string;
            startDate: string;
            endDate: string;
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
            timeSlots: Array<{
              id: string;
              name: string;
              description: string | null;
              startTime: string;
              endTime: string;
              days: string[];
              isActive: boolean;
              createdAt: string;
              updatedAt: string;
            }>;
            products: Array<{
              productId: string;
            }>;
          } | null;
        }>(OFFER_QUERY, {
          userId: user.id,
          id: offerId,
        });
        
        if (data.offer) {
          const offer = data.offer;
          
          // Transform GraphQL response to match Offer type
          const transformedDiscountTypes = offer.discountTypes.map((dt) => ({
            id: dt.id,
            discountType: dt.discountType as 'percentage' | 'fixed' | 'buy_x_get_y',
            discountValue: dt.discountValue,
            minOrderValue: dt.minOrderValue || undefined,
            minQuantity: dt.minQuantity || undefined,
            isActive: dt.isActive,
            priority: dt.priority,
          }));
          
          // Transform date ranges
          const transformedDateRanges = offer.dateRanges.map((dr) => ({
            id: dr.id,
            name: dr.name,
            description: dr.description || '',
            startDate: dr.startDate,
            endDate: dr.endDate,
            isActive: dr.isActive,
            offerCount: 0,
            createdAt: dr.createdAt,
            updatedAt: dr.updatedAt,
          }));
          
          // Transform time slots
          const transformedTimeSlots = offer.timeSlots.map((ts) => ({
            id: ts.id,
            name: ts.name,
            description: ts.description || undefined,
            startTime: ts.startTime,
            endTime: ts.endTime,
            days: ts.days || [],
            isActive: ts.isActive,
            offerCount: 0,
            createdAt: ts.createdAt,
            updatedAt: ts.updatedAt,
          }));
          
          // Transform products from GraphQL response
          const transformedProducts = offer.products.map((p) => ({
            id: `po-${Date.now()}-${p.productId}`,
            productId: p.productId,
            offerId: offer.id,
            discountType: 'percentage' as const,
            discountValue: 0,
            isActive: true
          }));

          // Compute productOfferBadges from discount types
          const computedBadges: Record<string, 'Discount' | 'Promotion' | 'All Offers' | 'Offer'> = {};
          transformedProducts.forEach((p) => {
            const hasDiscount = transformedDiscountTypes.some(dt => (dt.discountType === 'percentage' || dt.discountType === 'fixed') && dt.isActive);
            const hasPromotion = transformedDiscountTypes.some(dt => dt.discountType === 'buy_x_get_y' && dt.isActive);
              
            // Compute badge: "All Offers" if both discount and promotion types are present
              if (hasDiscount && hasPromotion) {
              computedBadges[p.productId] = 'All Offers';
              } else if (hasPromotion) {
              computedBadges[p.productId] = 'Promotion';
              } else if (hasDiscount) {
              computedBadges[p.productId] = 'Discount';
              } else {
              computedBadges[p.productId] = 'Offer';
            }
          });
          
          const transformedOffer: Offer = {
            id: offer.id,
            offerId: offer.offerId,
            name: offer.name,
            description: offer.description || undefined,
            type: offer.type as ('discount' | 'promotion')[],
            status: offer.status as 'active' | 'expired' | 'inactive',
            startDate: offer.startDate,
            endDate: offer.endDate,
            totalUsage: offer.totalUsage,
            totalDiscountGiven: offer.totalDiscountGiven,
            discountTypes: transformedDiscountTypes,
            dateRanges: transformedDateRanges,
            timeSlots: transformedTimeSlots,
            products: transformedProducts,
            productOfferBadges: computedBadges,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          
          setCurrentOffer(transformedOffer);
          setOriginalOffer(JSON.parse(JSON.stringify(transformedOffer))); // Deep clone
        } else {
          setError('Offer not found');
        }
      } catch (error) {
        setError('Failed to load offer');
      } finally {
        setLoading(false);
      }
    };

    fetchOffer();
  }, [user?.id, offerId]);

  // Helper function to refresh the current offer after saving using GraphQL
  const refreshOffer = async () => {
    if (!user?.id || !offerId) return;
    
    try {
      const data = await fetchGraphQL<{
        offer: {
          id: string;
          offerId: string;
          name: string;
          description: string | null;
          type: string[];
          status: string;
          startDate: string;
          endDate: string;
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
          timeSlots: Array<{
            id: string;
            name: string;
            description: string | null;
            startTime: string;
            endTime: string;
            days: string[];
            isActive: boolean;
            createdAt: string;
            updatedAt: string;
          }>;
          products: Array<{
            productId: string;
          }>;
        } | null;
      }>(OFFER_QUERY, {
        userId: user.id,
        id: offerId,
      });
      
      if (data.offer) {
        const offer = data.offer;
        
        // Transform GraphQL response to match Offer type
        const transformedDiscountTypes = offer.discountTypes.map((dt) => ({
          id: dt.id,
          discountType: dt.discountType as 'percentage' | 'fixed' | 'buy_x_get_y',
          discountValue: dt.discountValue,
          minOrderValue: dt.minOrderValue || undefined,
          minQuantity: dt.minQuantity || undefined,
          isActive: dt.isActive,
          priority: dt.priority,
        }));
        
        // Transform products from GraphQL response
        const transformedProducts = offer.products.map((p) => ({
          id: `po-${Date.now()}-${p.productId}`,
          productId: p.productId,
          offerId: offer.id,
          discountType: 'percentage' as const,
          discountValue: 0,
          isActive: true
        }));

        // Compute productOfferBadges from discount types
        const computedBadges: Record<string, 'Discount' | 'Promotion' | 'All Offers' | 'Offer'> = {};
        transformedProducts.forEach((p) => {
          const hasDiscount = transformedDiscountTypes.some(dt => (dt.discountType === 'percentage' || dt.discountType === 'fixed') && dt.isActive);
          const hasPromotion = transformedDiscountTypes.some(dt => dt.discountType === 'buy_x_get_y' && dt.isActive);
            
          // Compute badge: "All Offers" if both discount and promotion types are present
            if (hasDiscount && hasPromotion) {
            computedBadges[p.productId] = 'All Offers';
            } else if (hasPromotion) {
            computedBadges[p.productId] = 'Promotion';
            } else if (hasDiscount) {
            computedBadges[p.productId] = 'Discount';
            } else {
            computedBadges[p.productId] = 'Offer';
          }
        });
        
        // Transform date ranges
        const transformedDateRanges = offer.dateRanges.map((dr) => ({
          id: dr.id,
          name: dr.name,
          description: dr.description || '',
          startDate: dr.startDate,
          endDate: dr.endDate,
          isActive: dr.isActive,
          offerCount: 0,
          createdAt: dr.createdAt,
          updatedAt: dr.updatedAt,
        }));

        // Transform time slots
        const transformedTimeSlots = offer.timeSlots.map((ts) => ({
          id: ts.id,
          name: ts.name,
          description: ts.description || undefined,
          startTime: ts.startTime,
          endTime: ts.endTime,
          days: ts.days || [],
          isActive: ts.isActive,
          offerCount: 0,
          createdAt: ts.createdAt,
          updatedAt: ts.updatedAt,
        }));
        
        const transformedOffer: Offer = {
          id: offer.id,
          offerId: offer.offerId,
          name: offer.name,
          description: offer.description || undefined,
          type: offer.type as ('discount' | 'promotion')[],
          status: offer.status as 'active' | 'expired' | 'inactive',
          startDate: offer.startDate,
          endDate: offer.endDate,
          totalUsage: offer.totalUsage,
          totalDiscountGiven: offer.totalDiscountGiven,
          discountTypes: transformedDiscountTypes,
          dateRanges: transformedDateRanges,
          timeSlots: transformedTimeSlots,
          products: transformedProducts,
          productOfferBadges: computedBadges,
          createdAt: currentOffer?.createdAt || new Date().toISOString(),
          updatedAt: currentOffer?.updatedAt || new Date().toISOString(),
        };
        
        setCurrentOffer(transformedOffer);
        setOriginalOffer(JSON.parse(JSON.stringify(transformedOffer))); // Deep clone
      }
    } catch (error) {
      // Ignore refresh errors
    }
  };

  // Handle changes from child components
  const handleOfferChange = (updatedData: Partial<Offer>) => {
    if (currentOffer) {
      setCurrentOffer({ ...currentOffer, ...updatedData });
      setHasUnsavedChanges(true);
    }
  };

  // GraphQL mutation to update offer
  const UPDATE_OFFER_MUTATION = `
    mutation UpdateOffer(
      $userId: Int!
      $id: String!
      $name: String
      $description: String
      $type: [String!]
      $status: String
      $startDate: String
      $endDate: String
      $discountTypes: [DiscountTypeInput!]
      $productIds: [String!]
      $dateRanges: [DateRangeInput!]
      $timeSlots: [TimeSlotInput!]
    ) {
      updateOffer(
        userId: $userId
        id: $id
        name: $name
        description: $description
        type: $type
        status: $status
        startDate: $startDate
        endDate: $endDate
        discountTypes: $discountTypes
        productIds: $productIds
        dateRanges: $dateRanges
        timeSlots: $timeSlots
      ) {
        id
        offerId
        name
        status
        products {
          productId
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
        timeSlots {
          id
          name
          description
          startTime
          endTime
          days
          isActive
          createdAt
          updatedAt
        }
      }
    }
  `;

  // Save all changes using GraphQL
  const handleSave = async () => {
    if (!currentOffer || !hasUnsavedChanges || !user?.id) return;

    setIsSaving(true);
    try {
      // Transform discount types for GraphQL
      const graphQLDiscountTypes = (currentOffer.discountTypes || []).map((dt) => ({
        discountType: dt.discountType,
        discountValue: dt.discountValue,
        name: dt.name || null,
        description: dt.description || null,
        minOrderValue: dt.minOrderValue ? parseFloat(String(dt.minOrderValue).replace(/\./g, '')) : null,
        minQuantity: dt.minQuantity || null,
        isActive: dt.isActive !== false,
        priority: dt.priority || 1,
      }));

      // Extract product IDs from currentOffer.products
      // This ensures removed products are not included when saving
      const productIds = (currentOffer.products || []).map((p) => p.productId).filter(Boolean);
      
      // Always send productIds (even if empty array) to ensure products are updated correctly
      // Empty array means remove all products, array with IDs means set those products

      // Transform date ranges for GraphQL
      const graphQLDateRanges = (currentOffer.dateRanges || []).map((dr) => ({
        name: dr.name,
        description: dr.description || null,
        startDate: typeof dr.startDate === 'string' ? dr.startDate : new Date(dr.startDate).toISOString(),
        endDate: typeof dr.endDate === 'string' ? dr.endDate : new Date(dr.endDate).toISOString(),
        isActive: dr.isActive !== false,
      }));

      // Transform time slots for GraphQL
      const graphQLTimeSlots = (currentOffer.timeSlots || []).map((ts) => ({
        name: ts.name,
        description: ts.description || null,
        startTime: ts.startTime,
        endTime: ts.endTime,
        days: ts.days || [],
        isActive: ts.isActive !== false,
      }));

      const updateResult = await fetchGraphQL<{
        updateOffer: {
          id: string;
          offerId: string;
          name: string;
          status: string;
          products: Array<{
            productId: string;
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
          timeSlots: Array<{
            id: string;
            name: string;
            description: string | null;
            startTime: string;
            endTime: string;
            days: string[];
            isActive: boolean;
            createdAt: string;
            updatedAt: string;
          }>;
        };
      }>(UPDATE_OFFER_MUTATION, {
        userId: user.id,
        id: currentOffer.id,
        name: currentOffer.name || null,
        description: currentOffer.description || null,
        type: currentOffer.type || null,
        status: currentOffer.status || 'active',
        startDate: currentOffer.startDate || null,
        endDate: currentOffer.endDate || null,
        discountTypes: graphQLDiscountTypes.length > 0 ? graphQLDiscountTypes : null,
        productIds: productIds, // Always send array (even if empty) to ensure products are updated/removed
        dateRanges: graphQLDateRanges.length > 0 ? graphQLDateRanges : null,
        timeSlots: graphQLTimeSlots.length > 0 ? graphQLTimeSlots : null,
      });

      // Update currentOffer with the returned dateRanges and timeSlots
      if (updateResult.updateOffer && currentOffer) {
        const updatedDateRanges = updateResult.updateOffer.dateRanges.map((dr) => ({
          id: dr.id,
          name: dr.name,
          description: dr.description || '',
          startDate: dr.startDate,
          endDate: dr.endDate,
          isActive: dr.isActive,
          offerCount: 0,
          createdAt: dr.createdAt,
          updatedAt: dr.updatedAt,
        }));

        const updatedTimeSlots = updateResult.updateOffer.timeSlots.map((ts) => ({
          id: ts.id,
          name: ts.name,
          description: ts.description || undefined,
          startTime: ts.startTime,
          endTime: ts.endTime,
          days: ts.days || [],
          isActive: ts.isActive,
          offerCount: 0,
          createdAt: ts.createdAt,
          updatedAt: ts.updatedAt,
        }));

        // Transform products from GraphQL response
        const updatedProducts = updateResult.updateOffer.products.map((p) => {
          // Find existing product data to preserve discount info
          const existingProduct = currentOffer.products?.find(ep => ep.productId === p.productId);
          return existingProduct || {
            id: `po-${Date.now()}-${p.productId}`,
            productId: p.productId,
            offerId: currentOffer.id,
            discountType: 'percentage' as const,
            discountValue: 0,
            isActive: true
          };
        });

        // Preserve productOfferBadges - compute from discount types if needed
        const updatedBadges = { ...currentOffer.productOfferBadges };
        // Ensure all products in the offer have badges - recompute based on active discount types
        updatedProducts.forEach((p) => {
          // Always recompute badge from current discount types to ensure accuracy
          const activeDiscountTypes = currentOffer.discountTypes?.filter(dt => dt.isActive !== false) || [];
          const hasDiscount = activeDiscountTypes.some(dt => dt.discountType === 'percentage' || dt.discountType === 'fixed');
          const hasPromotion = activeDiscountTypes.some(dt => dt.discountType === 'buy_x_get_y');
          
          // Compute badge: "All Offers" if both discount and promotion types are present
          if (hasDiscount && hasPromotion) {
            updatedBadges[p.productId] = 'All Offers';
          } else if (hasPromotion) {
            updatedBadges[p.productId] = 'Promotion';
          } else if (hasDiscount) {
            updatedBadges[p.productId] = 'Discount';
          } else {
            updatedBadges[p.productId] = 'Offer';
          }
        });

        // Update currentOffer with saved products, badges, dateRanges and timeSlots
        setCurrentOffer({
          ...currentOffer,
          products: updatedProducts,
          productOfferBadges: updatedBadges,
          dateRanges: updatedDateRanges,
          timeSlots: updatedTimeSlots,
        });
        setOriginalOffer({
          ...currentOffer,
          products: updatedProducts,
          productOfferBadges: updatedBadges,
          dateRanges: updatedDateRanges,
          timeSlots: updatedTimeSlots,
        });
      } else {
        // Fallback: refresh the entire offer if mutation response doesn't include dateRanges/timeSlots
      await refreshOffer();
      }
      
      setHasUnsavedChanges(false);
      
      // Show success modal for 2 seconds, then reload page to validate saved data
      setShowSuccessModal(true);
      setTimeout(() => {
        setShowSuccessModal(false);
        // Reload page to validate that all data is saved correctly
        window.location.reload();
      }, 2000);
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

  // Show loading state (following products module pattern)
  if (loading) {
    return (
      <div className="w-full mx-auto p-4 bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[#0a61d7] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading offer...</p>
        </div>
      </div>
    );
  }

  // Show error state (following products module pattern)
  if (error || !currentOffer) {
    return (
      <div className="w-full mx-auto p-4 bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'Offer not found'}</p>
          <button 
            onClick={() => router.push('/offers')}
            className="px-4 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#084ba6] transition-colors"
          >
            Back to Offers
          </button>
        </div>
      </div>
    );
  }

  const renderActiveComponent = () => {
    if (!currentOffer) return null;

    const safeHandleChange = (updates: Record<string, unknown>) => {
      handleOfferChange(updates);
    };

    switch (activeTab) {
      case 'analytics':
        return <OfferAnalytics offers={[currentOffer]} />;
      case 'type':
        return <OfferType offerData={currentOffer} onOfferChange={safeHandleChange} />;
      case 'products':
        return (
          <ProductIntegration 
            offerData={currentOffer}
            onOfferChange={safeHandleChange}
            onAddProduct={() => {}}
            onRemoveProduct={() => {}}
            onUpdateProductDiscount={() => {}}
          />
        );
      case 'range':
        return <RangeManagement offerData={currentOffer} onOfferChange={safeHandleChange} />;
      default:
        return <OfferType offerData={currentOffer} onOfferChange={safeHandleChange} />;
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
                {(currentOffer.status || 'active').charAt(0).toUpperCase() + (currentOffer.status || 'active').slice(1)}
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
                      (currentOffer.status || 'active') === 'active'
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
                      (currentOffer.status || 'active') === 'inactive'
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
              onClick={() => setActiveTab(tab.id as 'analytics' | 'type' | 'products' | 'range')}
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

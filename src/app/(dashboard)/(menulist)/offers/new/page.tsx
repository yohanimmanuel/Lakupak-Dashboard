'use client';

import React, { useState, useEffect } from 'react';
import { ArrowLeft, BarChart3, Target, Package, Calendar, Save, X, CheckCircle, ChevronDown, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useUserStore } from '@/store/userStore';
import { useOfferCreationStore } from '@/store/offerCreationStore';
import OfferAnalytics from '@/components/offersincentivesdisc/OfferAnalytics';
import OfferType from '@/components/offersincentivesdisc/OfferType';
import ProductIntegration from '@/components/offersincentivesdisc/ProductIntegration';
import RangeManagement from '@/components/offersincentivesdisc/RangeManagement';
import CreateOfferTypeModal from '@/components/offersincentivesdisc/CreateOfferTypeModal';
import CreateDateRangeModal from '@/components/offersincentivesdisc/CreateDateRangeModal';
import { formatCurrency } from '@/utils/currencyUtils';
import { fetchGraphQL } from '@/lib/graphqlClient';

export default function CreateOfferPage() {
  const router = useRouter();
  const user = useUserStore(state => state.user);
  const [activeTab, setActiveTab] = useState<'analytics' | 'type' | 'products' | 'range'>('type');
  const [isCreating, setIsCreating] = useState(false);
  const [offerStatus, setOfferStatus] = useState<'active' | 'inactive'>('active');
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showCreateTypeModal, setShowCreateTypeModal] = useState(false);
  const [showCreateRangeModal, setShowCreateRangeModal] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Get state from the centralized store
  const {
    name,
    description,
    type,
    discountTypes,
    minOrderValue,
    minQuantity,
    selectedDateRange,
    dateRanges,
    startDate,
    endDate,
    perCustomerLimit,
    selectedProducts,
    productOfferBadges,
    isDateRangeConfigured,
    areProductsSelected,
    isReadyToCreate,
    setName,
    setDescription,
    setType,
    addDiscountType,
    updateDiscountType,
    removeDiscountType,
    setMinOrderValue,
    setMinQuantity,
    setSelectedDateRange,
    addDateRange,
    updateDateRange,
    removeDateRange,
    setStartDate,
    setEndDate,
    setPerCustomerLimit,
    addProduct,
    removeProduct,
    updateProductDiscount,
    clearProducts,
    setOfferTypeConfigured,
    setDateRangeConfigured,
    setProductsSelected,
    reset,
    resetToDefaults,
  } = useOfferCreationStore();

  // Reset store to fresh state when component mounts (for new offer creation)
  // resetToDefaults is from Zustand store (stable reference), but included for completeness
  useEffect(() => {
    resetToDefaults();
  }, [resetToDefaults]); // resetToDefaults is stable from store, but included for best practices

  // Compute status dots from persisted data to survive reloads
  const isOfferTypeConfigured = discountTypes.length > 0;
  // Date ranges are optional - can be configured by having ranges OR by explicitly skipping (isDateRangeConfigured flag)
  const isDateRangeConfiguredComputed = isDateRangeConfigured || Boolean(selectedDateRange || (dateRanges && dateRanges.length > 0));
  const isProductsConfigured = Object.keys(productOfferBadges || {}).length > 0;

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

  const handleSaveOffer = async () => {
    if (!isReadyToCreate) {
      alert('Please complete all required fields before creating the offer.');
      return;
    }

    setIsCreating(true);
    
    try {
      // Determine offer types based on discount types
      const activeDiscountTypes = discountTypes.filter(dt => dt.isActive);
      const offerTypes: ('discount' | 'promotion')[] = [];
      
      if (activeDiscountTypes.some(dt => dt.discountType === 'percentage' || dt.discountType === 'fixed')) {
        offerTypes.push('discount');
      }
      if (activeDiscountTypes.some(dt => dt.discountType === 'buy_x_get_y')) {
        offerTypes.push('promotion');
      }
      
      // Fallback to default if no types determined
      if (offerTypes.length === 0) {
        offerTypes.push('discount');
      }

      const productIds = Object.keys(productOfferBadges || {});
      
      // GraphQL mutation to create offer
      const CREATE_OFFER_MUTATION = `
        mutation CreateOffer(
          $userId: Int!
          $name: String!
          $description: String
          $type: [String!]!
          $status: String
          $discountTypes: [DiscountTypeInput!]!
          $productIds: [String!]!
          $dateRanges: [DateRangeInput!]
        ) {
          createOffer(
            userId: $userId
            name: $name
            description: $description
            type: $type
            status: $status
            discountTypes: $discountTypes
            productIds: $productIds
            dateRanges: $dateRanges
          ) {
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
          }
        }
      `;

      // Transform discount types for GraphQL
      const graphQLDiscountTypes = discountTypes.map((dt) => ({
        discountType: dt.discountType,
        discountValue: dt.discountValue,
        name: dt.name || null,
        description: dt.description || null,
        minOrderValue: dt.minOrderValue ? parseFloat(String(dt.minOrderValue).replace(/\./g, '')) : null,
        minQuantity: dt.minQuantity || null,
        isActive: dt.isActive !== false,
        priority: dt.priority || discountTypes.length + 1,
      }));

      // Transform date ranges for GraphQL
      const graphQLDateRanges = (dateRanges || []).map((dr) => ({
        name: dr.name,
        description: dr.description || null,
        startDate: typeof dr.startDate === 'string' ? dr.startDate : new Date(dr.startDate).toISOString(),
        endDate: typeof dr.endDate === 'string' ? dr.endDate : new Date(dr.endDate).toISOString(),
        isActive: dr.isActive !== false,
      }));

      await fetchGraphQL(CREATE_OFFER_MUTATION, {
        userId: user?.id,
        name,
        description: description || null,
        type: offerTypes,
        status: offerStatus,
        discountTypes: graphQLDiscountTypes,
        productIds,
        dateRanges: graphQLDateRanges.length > 0 ? graphQLDateRanges : null,
      });

      // Reset the store and redirect
      reset();
      router.push('/offers');
    } catch (error) {
      alert('Failed to create offer. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleCancel = () => {
    resetToDefaults(); // Clear store data
    router.push('/offers');
  };

  const renderActiveComponent = () => {
    const commonProps = {
      isNewOffer: true,
      discountTypes,
      selectedProducts,
      isOfferTypeConfigured,
      isDateRangeConfigured: isDateRangeConfiguredComputed,
      areProductsSelected,
    };

    switch (activeTab) {
      case 'analytics':
        return <OfferAnalytics {...commonProps} />;
      case 'type':
        return (
          <OfferType 
            {...commonProps}
            onOpenCreateModal={() => setShowCreateTypeModal(true)}
            onAddDiscountType={(dt) => {
              addDiscountType({
                name: dt.name ?? undefined,
                description: dt.description ?? undefined,
                discountType: dt.discountType,
                discountValue: dt.discountValue,
                minOrderValue: typeof dt.minOrderValue === 'number' ? String(dt.minOrderValue) : dt.minOrderValue ?? undefined,
                minQuantity: dt.minQuantity ?? undefined,
                perCustomerLimit: dt.perCustomerLimit ?? undefined,
                isActive: dt.isActive,
                priority: dt.priority ?? discountTypes.length + 1,
              });
            }}
            onUpdateDiscountType={(id, updates) => {
              updateDiscountType(id, {
                name: updates.name ?? undefined,
                description: updates.description ?? undefined,
                discountType: updates.discountType,
                discountValue: updates.discountValue,
                minOrderValue: typeof updates.minOrderValue === 'number' ? String(updates.minOrderValue) : updates.minOrderValue ?? undefined,
                minQuantity: updates.minQuantity ?? undefined,
                perCustomerLimit: updates.perCustomerLimit ?? undefined,
                isActive: updates.isActive,
                priority: updates.priority,
              });
            }}
            onRemoveDiscountType={removeDiscountType}
          />
        );
      case 'products':
        return (
          <ProductIntegration 
            {...commonProps}
            onAddProduct={addProduct}
            onRemoveProduct={removeProduct}
            onUpdateProductDiscount={updateProductDiscount}
          />
        );
      case 'range':
        return (
          <RangeManagement 
            {...commonProps}
            selectedDateRange={selectedDateRange ? {
              ...selectedDateRange,
              offerCount: 0,
              createdAt: new Date().toISOString()
            } : undefined}
            onOpenDateModal={() => setShowCreateRangeModal(true)}
            onSelectDateRange={(dr) => setSelectedDateRange({
              id: dr.id,
              name: dr.name,
              description: dr.description,
              startDate: dr.startDate,
              endDate: dr.endDate,
              isActive: dr.isActive
            })}
          />
        );
      default:
        return <OfferAnalytics {...commonProps} />;
    }
  };

  const handleSaveOfferType = (typeData: {
    name?: string;
    discountType: string;
    discountValue: number;
    description?: string;
    minOrderValue?: string;
    minQuantity?: number;
    maxUsage?: number;
    perCustomerLimit?: number;
  }) => {
    // Add the discount type to the store with full fields so UI reflects user input
    const discountTypeToAdd: Omit<typeof discountTypes[0], 'id'> = {
      name: typeData.name ?? undefined,
      description: typeData.description ?? undefined,
      discountType: typeData.discountType as 'percentage' | 'fixed' | 'buy_x_get_y',
      discountValue: typeData.discountValue,
      minOrderValue: typeData.minOrderValue ?? undefined,
      minQuantity: typeData.minQuantity ?? undefined,
      perCustomerLimit: typeData.perCustomerLimit ?? undefined,
      isActive: true,
      priority: discountTypes.length + 1,
    };
    addDiscountType(discountTypeToAdd);
    
    // Also update basic info (optional) for create-offer flow
    if (typeData.name) setName(typeData.name);
    if (typeData.description) setDescription(typeData.description);
    if (typeData.minOrderValue) setMinOrderValue(typeData.minOrderValue);
    if (typeData.minQuantity) setMinQuantity(typeData.minQuantity);
    if (typeData.perCustomerLimit) setPerCustomerLimit(typeData.perCustomerLimit);
    
    setOfferTypeConfigured(true);
    setShowCreateTypeModal(false);
  };

  const handleSaveDateRange = (rangeData: {
    name: string;
    description?: string;
    startDate: string | Date;
    endDate: string | Date;
  }) => {
    const id = `range_${Date.now()}`;
    const dateRangeToAdd = {
      id,
      name: rangeData.name,
      description: rangeData.description ?? '',
      startDate: typeof rangeData.startDate === 'string' ? rangeData.startDate : rangeData.startDate.toISOString(),
      endDate: typeof rangeData.endDate === 'string' ? rangeData.endDate : rangeData.endDate.toISOString(),
      isActive: true,
    };
    addDateRange(dateRangeToAdd);
    setShowCreateRangeModal(false);
  };


  return (
    <div className="p-4 space-y-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={handleCancel}
            className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-black hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Offers
          </button>
          <div>
            <h1 className="text-2xl font-bold text-black">Create New Offer</h1>
            <p className="text-gray-500 text-sm">Advanced offer management and analytics</p>
            
            {/* Status Indicator */}
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isOfferTypeConfigured ? 'bg-green-500' : 'bg-gray-300'}`} />
                <span className="text-xs text-gray-600">Offer Type</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isDateRangeConfiguredComputed ? 'bg-green-500' : 'bg-gray-300'}`} />
                <span className="text-xs text-gray-600">Date Range</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isProductsConfigured ? 'bg-green-500' : 'bg-gray-300'}`} />
                <span className="text-xs text-gray-600">Products</span>
              </div>
              {!isReadyToCreate && (
                <div className="flex items-center gap-1 text-amber-600">
                  <AlertCircle className="w-3 h-3" />
                  <span className="text-xs">Complete all steps to create offer</span>
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Preview Button */}
          {isReadyToCreate && (
            <button
              onClick={() => setShowPreview(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Preview
            </button>
          )}
          
          {/* Status Selector */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Status:</label>
            <div className="relative">
              <button
                className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-100 text-sm"
                onClick={() => setShowStatusDropdown(!showStatusDropdown)}
              >
                {offerStatus.charAt(0).toUpperCase() + offerStatus.slice(1)}
                <ChevronDown className="w-4 h-4 ml-1 text-gray-500" />
              </button>
              {showStatusDropdown && (
                <div className="absolute right-0 mt-2 w-32 bg-white border border-[#e6e6e6] rounded-lg shadow z-20">
                  <button
                    onClick={() => {
                      setOfferStatus('active');
                      setShowStatusDropdown(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm first:rounded-t-lg last:rounded-b-lg ${
                      offerStatus === 'active'
                        ? 'text-[#0a61d7] font-semibold hover:bg-gray-100'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    Active
                  </button>
                  <button
                    onClick={() => {
                      setOfferStatus('inactive');
                      setShowStatusDropdown(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm first:rounded-t-lg last:rounded-b-lg ${
                      offerStatus === 'inactive'
                        ? 'text-[#0a61d7] font-semibold hover:bg-gray-100'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    Inactive
                  </button>
                </div>
              )}
            </div>
          </div>
          
          <button
            onClick={handleSaveOffer}
            disabled={isCreating || !isReadyToCreate}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg font-semibold transition text-sm ${
              isReadyToCreate && !isCreating
                ? 'bg-[#0a61d7] text-white hover:bg-[#084ba6]'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {isCreating ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                {offerStatus === 'inactive' ? 'Saving...' : 'Creating...'}
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                {offerStatus === 'inactive' ? 'Save as Inactive' : 'Create Offer'}
              </>
            )}
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
      <div className="bg-white rounded-lg border border-[#e6e6e6]">
        {renderActiveComponent()}
      </div>

      {/* Modals */}
      <CreateOfferTypeModal
        isOpen={showCreateTypeModal}
        onClose={() => setShowCreateTypeModal(false)}
        onSave={handleSaveOfferType}
      />

      <CreateDateRangeModal
        isOpen={showCreateRangeModal}
        onClose={() => setShowCreateRangeModal(false)}
        onSave={handleSaveDateRange}
      />


      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto hide-scrollbar">
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-[#e6e6e6] p-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-black">Offer Preview</h3>
                <p className="text-sm text-gray-500">How customers will see this offer</p>
              </div>
              <button
                onClick={() => setShowPreview(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Preview Content */}
            <div className="p-4 space-y-4">
              {/* Offer Details */}
              <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-lg border border-blue-200">
                <h4 className="text-lg font-bold text-gray-900 mb-2">{name || 'Offer Name'}</h4>
                <p className="text-sm text-gray-600 mb-3">{description || 'Offer description will appear here'}</p>
                
                {/* Discount Types Preview */}
                <div className="space-y-2">
                  {discountTypes.filter(dt => dt.isActive).map((dt, index) => (
                    <div key={index} className="flex items-center gap-2 bg-white/80 rounded-md p-2">
                      {dt.discountType === 'percentage' && (
                        <span className="px-3 py-1 rounded-md text-xs font-semibold bg-red-50 text-red-600 border border-red-200">
                          {dt.discountValue}% OFF
                        </span>
                      )}
                      {dt.discountType === 'fixed' && (
                        <span className="px-3 py-1 rounded-md text-xs font-semibold bg-red-50 text-red-600 border border-red-200">
                          {formatCurrency(dt.discountValue)} OFF
                        </span>
                      )}
                      {dt.discountType === 'buy_x_get_y' && (
                        <span className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-semibold bg-purple-50 text-purple-600 border border-purple-200">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
                          </svg>
                          Buy {dt.minQuantity} Get {Math.abs(dt.discountValue)} Free
                        </span>
                      )}
                      {dt.name && <span className="text-xs text-gray-600">{dt.name}</span>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Applied Products */}
              {Object.keys(productOfferBadges || {}).length > 0 && (
                <div className="bg-gray-50 p-4 rounded-lg border border-[#e6e6e6]">
                  <h5 className="text-sm font-semibold text-gray-900 mb-2">Applied to:</h5>
                  <div className="text-sm text-gray-600">
                    {Object.keys(productOfferBadges || {}).length} product(s) selected
                  </div>
                </div>
              )}

              {/* Offer Validity */}
              {selectedDateRange && (
                <div className="bg-gray-50 p-4 rounded-lg border border-[#e6e6e6]">
                  <h5 className="text-sm font-semibold text-gray-900 mb-2">Valid Period:</h5>
                  <div className="text-sm text-gray-600 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span>{selectedDateRange.name}</span>
                  </div>
                </div>
              )}

              {/* Terms & Conditions */}
              <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
                <p className="text-xs text-amber-800">
                  <strong>Note:</strong> This is a preview. The actual offer will be live once you create it.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-white border-t border-[#e6e6e6] p-4">
              <button
                onClick={() => setShowPreview(false)}
                className="w-full px-4 py-2 bg-[#0a61d7] text-white font-semibold rounded-lg hover:bg-[#084ba6] transition"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
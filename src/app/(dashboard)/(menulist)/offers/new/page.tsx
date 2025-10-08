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
import CreateTimeSlotModal from '@/components/offersincentivesdisc/CreateTimeSlotModal';

export default function CreateOfferPage() {
  const router = useRouter();
  const user = useUserStore(state => state.user);
  const [activeTab, setActiveTab] = useState<'analytics' | 'type' | 'products' | 'range'>('type');
  const [isCreating, setIsCreating] = useState(false);
  const [offerStatus, setOfferStatus] = useState<'active' | 'inactive'>('active');
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showCreateTypeModal, setShowCreateTypeModal] = useState(false);
  const [showCreateRangeModal, setShowCreateRangeModal] = useState(false);
  const [showCreateTimeSlotModal, setShowCreateTimeSlotModal] = useState(false);

  // Get state from the centralized store
  const {
    name,
    description,
    type,
    discountTypes,
    minOrderValue,
    minQuantity,
    selectedDateRange,
    selectedTimeSlot,
    dateRanges,
    timeSlots,
    startDate,
    endDate,
    maxUsage,
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
    setSelectedTimeSlot,
    addDateRange,
    updateDateRange,
    removeDateRange,
    addTimeSlot,
    updateTimeSlot,
    removeTimeSlot,
    setStartDate,
    setEndDate,
    setMaxUsage,
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
  useEffect(() => {
    resetToDefaults();
  }, [resetToDefaults]);

  // Compute status dots from persisted data to survive reloads
  const isOfferTypeConfigured = discountTypes.length > 0;
  const isDateRangeConfiguredComputed = Boolean(selectedDateRange || selectedTimeSlot);
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
      // Get dates from selected range or time slot
      let offerStartDate = startDate;
      let offerEndDate = endDate;
      
      if (selectedDateRange) {
        offerStartDate = selectedDateRange.startDate;
        offerEndDate = selectedDateRange.endDate;
      } else if (selectedTimeSlot) {
        // For time slots, we need to set a date range
        // You might want to adjust this logic based on your requirements
        const today = new Date();
        offerStartDate = today.toISOString().split('T')[0];
        offerEndDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 30 days from now
      }

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

      const offerData = {
        name,
        description,
        type: offerTypes,
        discountTypes,
        startDate: offerStartDate,
        endDate: offerEndDate,
        productIds: Object.keys(productOfferBadges || {}), // Use products with offer badges
        dateRanges: dateRanges || [],
        timeSlots: timeSlots || [],
        status: offerStatus,
      };

      const response = await fetch('/api/offers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(offerData),
      });

      if (!response.ok) {
        throw new Error('Failed to create offer');
      }

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
            onAddDiscountType={addDiscountType}
            onUpdateDiscountType={updateDiscountType}
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
            selectedDateRange={selectedDateRange}
            selectedTimeSlot={selectedTimeSlot}
            onOpenDateModal={() => setShowCreateRangeModal(true)}
            onOpenTimeModal={() => setShowCreateTimeSlotModal(true)}
            onSelectDateRange={setSelectedDateRange}
            onSelectTimeSlot={setSelectedTimeSlot}
          />
        );
      default:
        return <OfferAnalytics {...commonProps} />;
    }
  };

  const handleSaveOfferType = (typeData: any) => {
    // Add the discount type to the store with full fields so UI reflects user input
    addDiscountType({
      name: typeData.name,
      description: typeData.description,
      discountType: typeData.discountType,
      discountValue: typeData.discountValue,
      minOrderValue: typeData.minOrderValue,
      minQuantity: typeData.minQuantity,
      maxUsage: typeData.maxUsage,
      perCustomerLimit: typeData.perCustomerLimit,
      isActive: true,
      priority: discountTypes.length + 1,
    });
    
    // Also update basic info (optional) for create-offer flow
    if (typeData.name) setName(typeData.name);
    if (typeData.description) setDescription(typeData.description);
    if (typeData.minOrderValue) setMinOrderValue(typeData.minOrderValue);
    if (typeData.minQuantity) setMinQuantity(typeData.minQuantity);
    if (typeData.maxUsage) setMaxUsage(typeData.maxUsage);
    if (typeData.perCustomerLimit) setPerCustomerLimit(typeData.perCustomerLimit);
    
    setOfferTypeConfigured(true);
    setShowCreateTypeModal(false);
  };

  const handleSaveDateRange = (rangeData: any) => {
    const id = `range_${Date.now()}`;
    addDateRange({
      id,
      name: rangeData.name,
      description: rangeData.description,
      startDate: rangeData.startDate,
      endDate: rangeData.endDate,
      isActive: true,
    });
    setShowCreateRangeModal(false);
  };

  const handleSaveTimeSlot = (slotData: any) => {
    const id = `slot_${Date.now()}`;
    addTimeSlot({
      id,
      name: slotData.name,
      startTime: slotData.startTime,
      endTime: slotData.endTime,
      days: slotData.days || [],
      isActive: true,
    });
    setShowCreateTimeSlotModal(false);
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
                <div className="absolute right-0 mt-2 w-32 bg-white border border-gray-200 rounded-lg shadow z-20">
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

      <CreateTimeSlotModal
        isOpen={showCreateTimeSlotModal}
        onClose={() => setShowCreateTimeSlotModal(false)}
        onSave={handleSaveTimeSlot}
      />
    </div>
  );
}
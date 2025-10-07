'use client';

import React, { useState, useEffect } from 'react';
import { Target, Percent, DollarSign, Gift, Settings, Plus, Edit, Trash2, TrendingUp } from 'lucide-react';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';
import { parseNumberByCurrency } from '@/config/currencyConfig';
import { useUserStore } from '@/store/userStore';
import { useOfferCreationStore } from '@/store/offerCreationStore';
import CreateOfferTypeModal from './CreateOfferTypeModal';

interface OfferTypeProps {
  isNewOffer?: boolean;
  onOpenCreateModal?: () => void;
  onAddDiscountType?: (discountType: any) => void;
  onUpdateDiscountType?: (id: string, updates: any) => void;
  onRemoveDiscountType?: (id: string) => void;
}

interface OfferType {
  id: string;
  name: string;
  description: string;
  discountType: 'percentage' | 'fixed' | 'buy_x_get_y';
  discountValue: number;
  minOrderValue?: string;
  minQuantity?: number;
  maxUsage?: number;
  perCustomerLimit?: number;
  isActive: boolean;
  createdAt: string;
}

export default function OfferType({ 
  isNewOffer = false, 
  onOpenCreateModal,
  onAddDiscountType,
  onUpdateDiscountType,
  onRemoveDiscountType
}: OfferTypeProps) {
  const user = useUserStore(state => state.user);
  const userCurrency = user?.currency || getDefaultCurrency();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingType, setEditingType] = useState<OfferType | null>(null);

  // Use store for offer types instead of API
  const { 
    discountTypes, 
    addDiscountType: storeAddDiscountType,
    updateDiscountType: storeUpdateDiscountType,
    removeDiscountType: storeRemoveDiscountType
  } = useOfferCreationStore();
  
  // Convert store discount types to display format
  const offerTypes: OfferType[] = discountTypes.map((dt, index) => {
    return {
      id: dt.id,
      name: dt.name || `${dt.discountType === 'percentage' ? 'Percentage' : dt.discountType === 'fixed' ? 'Fixed Amount' : 'Buy X Get Y'} Discount`,
      description: dt.description || `${dt.discountType === 'percentage' ? `${dt.discountValue}% off` : dt.discountType === 'fixed' ? `${formatCurrency(dt.discountValue, userCurrency)} off` : `Buy ${dt.discountValue} get 1 free`}`,
      discountType: dt.discountType,
      discountValue: dt.discountValue,
      minOrderValue: dt.minOrderValue,
      minQuantity: dt.minQuantity,
      maxUsage: dt.maxUsage,
      perCustomerLimit: dt.perCustomerLimit,
      isActive: dt.isActive,
      createdAt: new Date().toISOString(),
    };
  });

  // No API calls needed - data comes from store

  const getDiscountTypeIcon = (type: string) => {
    switch (type) {
      case 'percentage':
        return <Percent className="w-5 h-5 text-blue-600" />;
      case 'fixed':
        return <DollarSign className="w-5 h-5 text-green-600" />;
      case 'buy_x_get_y':
        return <Gift className="w-5 h-5 text-purple-600" />;
      default:
        return <Target className="w-5 h-5 text-gray-600" />;
    }
  };

  // Display currency exactly as user entered when a string was provided
  const renderCurrency = (value: string | number | undefined) => {
    if (typeof value === 'string') {
      const numeric = parseNumberByCurrency(value, userCurrency);
      return formatCurrency(numeric || 0, userCurrency);
    }
    return formatCurrency((value as number) || 0, userCurrency);
  };

  const getDiscountTypeColor = (type: string) => {
    switch (type) {
      case 'percentage':
        return 'bg-blue-50 border-blue-200';
      case 'fixed':
        return 'bg-green-50 border-green-200';
      case 'buy_x_get_y':
        return 'bg-purple-50 border-purple-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  const handleEdit = (type: OfferType) => {
    setEditingType(type);
    setShowEditModal(true);
  };

  const handleDelete = (typeId: string) => {
    // Remove from store
    if (onRemoveDiscountType) {
      onRemoveDiscountType(typeId);
    } else {
      storeRemoveDiscountType(typeId);
    }
  };

  const handleToggleActive = (typeId: string) => {
    // Find the discount type and toggle its active state
    const discountType = discountTypes.find(dt => dt.id === typeId);
    if (discountType) {
      if (onUpdateDiscountType) {
        onUpdateDiscountType(typeId, { isActive: !discountType.isActive });
      } else {
        storeUpdateDiscountType(typeId, { isActive: !discountType.isActive });
      }
    }
  };


  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-black">Offer Types</h2>
          <p className="text-gray-500 text-sm">Configure different types of discounts and promotions</p>
        </div>
        {offerTypes.length > 0 && offerTypes.length < 3 && (
          <button
            onClick={() => onOpenCreateModal ? onOpenCreateModal() : setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0a61d7] text-white font-semibold hover:bg-[#084ba6] transition text-sm"
          >
            <Plus className="w-4 h-4" />
            Create Type
          </button>
        )}
      </div>

      {/* Quick Stats removed per requirement */}

      {/* Empty state */}
      {offerTypes.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-10 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Target className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Offer Type Configured</h3>
          <p className="text-gray-500 text-sm mb-6">
            Create an offer type to define the discount or promotion rules for your offer.
          </p>
          <button
            onClick={() => onOpenCreateModal ? onOpenCreateModal() : setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#0a61d7] text-white rounded-lg hover:bg-[#084ba6] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Type
          </button>
        </div>
      ) : (
      /* Offer Types Grid */
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {offerTypes.map((type) => (
          <div key={type.id} className={`p-4 rounded-lg border-2 ${getDiscountTypeColor(type.discountType)}`}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                {getDiscountTypeIcon(type.discountType)}
                <div>
                  <h3 className="text-md font-semibold text-black">{type.name}</h3>
                  <p className="text-xs text-gray-600">{type.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleToggleActive(type.id)}
                  className={`w-3 h-3 rounded-full border-2 transition-colors ${
                    type.isActive 
                      ? 'bg-green-500 border-green-500' 
                      : 'bg-white border-gray-300'
                  }`}
                  title={type.isActive ? 'Active' : 'Inactive'}
                />
              </div>
            </div>

            <div className="space-y-3 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">Discount Value:</span>
                <span className="font-medium text-black text-xs">
                  {type.discountType === 'percentage' 
                    ? `${type.discountValue}%` 
                    : type.discountType === 'fixed'
                    ? formatCurrency(type.discountValue, userCurrency)
                    : `Get ${type.discountValue} free`
                  }
                </span>
              </div>

              {type.minOrderValue && type.discountType !== 'buy_x_get_y' && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">Min. Order:</span>
                  <span className="font-medium text-black text-xs">
                    {renderCurrency(type.minOrderValue)}
                  </span>
                </div>
              )}

              {type.minQuantity && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">Min. Quantity:</span>
                  <span className="font-medium text-black text-xs">{type.minQuantity} items</span>
                </div>
              )}

              {type.maxUsage && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">Max Usage:</span>
                  <span className="font-medium text-black text-xs">{type.maxUsage}</span>
                </div>
              )}

              {type.perCustomerLimit && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">Per Customer:</span>
                  <span className="font-medium text-black text-xs">{type.perCustomerLimit} times</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
              <div className="text-xs text-gray-500">
                Created: {new Date(type.createdAt).toLocaleDateString()}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleEdit(type)}
                  className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-100 rounded-lg transition-colors text-xs"
                  title="Edit Type"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(type.id)}
                  className="p-2 text-red-600 hover:text-red-700 hover:bg-red-100 rounded-lg transition-colors text-xs"
                  title="Delete Type"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      )}

      {/* Create/Edit Modal */}
      {(showCreateModal || showEditModal) && (
        <CreateOfferTypeModal
          isOpen={showCreateModal || showEditModal}
          onClose={() => {
            setShowCreateModal(false);
            setShowEditModal(false);
            setEditingType(null);
          }}
          editingType={editingType}
          onSave={async (typeData) => {
            // Enforce single offer per type: update if exists, else add
            const discountTypeData = {
              name: typeData.name,
              description: typeData.description,
              discountType: typeData.discountType,
              discountValue: typeData.discountValue,
              minOrderValue: typeData.minOrderValue,
              minQuantity: typeData.minQuantity,
              maxUsage: typeData.maxUsage,
              perCustomerLimit: typeData.perCustomerLimit,
              isActive: true,
              priority: 1,
            };
            
            // find existing by type
            const existing = discountTypes.find(dt => dt.discountType === typeData.discountType);
            if (existing) {
              if (onUpdateDiscountType) {
                onUpdateDiscountType(existing.id, discountTypeData);
              } else {
                storeUpdateDiscountType(existing.id, discountTypeData);
              }
            } else {
              if (onAddDiscountType) {
                onAddDiscountType(discountTypeData);
              } else {
                storeAddDiscountType(discountTypeData);
              }
            }
            
            setShowCreateModal(false);
            setShowEditModal(false);
            setEditingType(null);
          }}
        />
      )}
    </div>
  );
}

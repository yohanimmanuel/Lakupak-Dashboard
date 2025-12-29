'use client';

import React, { useState, useMemo } from 'react';
import { Target, Percent, DollarSign, Gift, Settings, Plus, Edit, Trash2, TrendingUp } from 'lucide-react';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';
import { parseNumberByCurrency } from '@/config/currencyConfig';
import { useUserStore } from '@/store/userStore';
import { useOfferCreationStore } from '@/store/offerCreationStore';
import CreateOfferTypeModal from './CreateOfferTypeModal';

interface DiscountTypeData {
  id: string;
  name?: string | null | undefined;
  description?: string | null | undefined;
  discountType: 'percentage' | 'fixed' | 'buy_x_get_y';
  discountValue: number;
  minOrderValue?: string | number | null | undefined;
  minQuantity?: number | null | undefined;
  freeQuantity?: number | null | undefined;
  perCustomerLimit?: number | null | undefined;
  isActive: boolean;
  priority?: number;
  offerId?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface OfferData {
  id: string;
  description?: string;
  type?: string | string[];
  discountTypes: DiscountTypeData[];
  dateRanges?: unknown[];
  products?: unknown[];
  [key: string]: unknown;
}

interface OfferTypeProps {
  isNewOffer?: boolean;
  offerData?: OfferData;
  onOfferChange?: (updatedData: Partial<OfferData>) => void;
  onOpenCreateModal?: () => void;
  onAddDiscountType?: (discountType: DiscountTypeData) => void;
  onUpdateDiscountType?: (id: string, updates: Partial<DiscountTypeData>) => void;
  onRemoveDiscountType?: (id: string) => void;
}

interface OfferType {
  id: string;
  name: string;
  description: string;
  discountType: 'percentage' | 'fixed' | 'buy_x_get_y';
  discountValue: number;
  minOrderValue?: string | number | null;
  minQuantity?: number | null;
  isActive: boolean;
  createdAt: string;
}

export default function OfferType({ 
  isNewOffer = false, 
  offerData,
  onOfferChange,
  onOpenCreateModal,
  onAddDiscountType,
  onUpdateDiscountType,
  onRemoveDiscountType
}: OfferTypeProps) {
  const user = useUserStore(state => state.user);
  const userCurrency = user?.currency || getDefaultCurrency();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingType, setEditingType] = useState<Partial<DiscountTypeData> | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [typeToDelete, setTypeToDelete] = useState<DiscountTypeData | null>(null);

  // Use store for offer types instead of API
  const { 
    discountTypes, 
    addDiscountType: storeAddDiscountType,
    updateDiscountType: storeUpdateDiscountType,
    removeDiscountType: storeRemoveDiscountType
  } = useOfferCreationStore();
  
  // Use offerData if provided (details view), otherwise use store data (create view)
  const displayDiscountTypes = offerData?.discountTypes || discountTypes;
  const isBatchEditMode = Boolean(offerData && onOfferChange);
  
  // Convert discount types to display format - memoized to avoid recalculation
  const offerTypes: OfferType[] = useMemo(() => {
    return displayDiscountTypes.map((dt: DiscountTypeData, index: number) => {
    return {
      id: dt.id,
      name: dt.name || `${dt.discountType === 'percentage' ? 'Percentage' : dt.discountType === 'fixed' ? 'Fixed Amount' : 'Buy X Get Y'} Discount`,
      description: dt.description || `${dt.discountType === 'percentage' ? `${dt.discountValue}% off` : dt.discountType === 'fixed' ? `${formatCurrency(dt.discountValue, userCurrency)} off` : `Buy ${dt.discountValue} get 1 free`}`,
      discountType: dt.discountType,
      discountValue: dt.discountValue,
      minOrderValue: dt.minOrderValue,
      minQuantity: dt.minQuantity,
      isActive: dt.isActive,
      createdAt: new Date().toISOString(),
    };
  });
  }, [displayDiscountTypes, userCurrency]);

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
    const discountType = displayDiscountTypes.find((dt) => dt.id === typeId);
    if (discountType) {
      setTypeToDelete(discountType);
      setShowDeleteModal(true);
    }
  };

  const handleDeleteConfirm = () => {
    if (!typeToDelete) return;

    if (isBatchEditMode) {
      // In batch edit mode, update parent state
      const updatedDiscountTypes = displayDiscountTypes.filter((dt) => dt.id !== typeToDelete.id);
      onOfferChange!({ discountTypes: updatedDiscountTypes });
    } else {
      // In create view, remove from store
      if (onRemoveDiscountType) {
        onRemoveDiscountType(typeToDelete.id);
      } else {
        storeRemoveDiscountType(typeToDelete.id);
      }
    }
    setShowDeleteModal(false);
    setTypeToDelete(null);
  };

  const handleDeleteCancel = () => {
    setShowDeleteModal(false);
    setTypeToDelete(null);
  };

  const handleToggleActive = (typeId: string) => {
    // Find the discount type and toggle its active state
    const discountType = displayDiscountTypes.find((dt) => dt.id === typeId);
    if (discountType) {
      if (isBatchEditMode) {
        // In batch edit mode, update parent state
        const updatedDiscountTypes = displayDiscountTypes.map((dt) =>
          dt.id === typeId ? { ...dt, isActive: !dt.isActive } : dt
        );
        onOfferChange!({ discountTypes: updatedDiscountTypes });
      } else {
        // In create view, update store
        if (onUpdateDiscountType) {
          onUpdateDiscountType(typeId, { isActive: !discountType.isActive });
        } else {
          storeUpdateDiscountType(typeId, { isActive: !discountType.isActive });
        }
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

              <div className="flex items-center justify-between">
              </div>

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
          editingType={editingType ? { 
            name: editingType.name || undefined, 
            description: editingType.description || undefined,
            discountType: editingType.discountType,
            discountValue: editingType.discountValue || 0,
            minOrderValue: editingType.minOrderValue ? String(editingType.minOrderValue) : undefined,
            minQuantity: editingType.minQuantity ?? undefined,
          } : undefined}
          onSave={async (typeData) => {
            // Enforce single offer per type: update if exists, else add
            const discountTypeData = {
              id: editingType?.id || `dt-${Date.now()}`,
              name: typeData.name,
              description: typeData.description,
              discountType: typeData.discountType,
              discountValue: typeData.discountValue,
              minOrderValue: typeData.minOrderValue,
              minQuantity: typeData.minQuantity,
              isActive: true,
              priority: 1,
            };
            
            // find existing by type
            const existing = displayDiscountTypes.find((dt) => dt.discountType === typeData.discountType);
            
            
            if (isBatchEditMode) {
              // In batch edit mode, update parent state
              let updatedDiscountTypes;
              if (existing) {
                // Update existing discount type
                updatedDiscountTypes = displayDiscountTypes.map((dt) =>
                  dt.id === existing.id ? { ...dt, ...discountTypeData } : dt
                );
              } else {
                // Add new discount type
                updatedDiscountTypes = [...displayDiscountTypes, discountTypeData];
              }
              onOfferChange!({ discountTypes: updatedDiscountTypes });
            } else {
              // In create view, use store or callbacks
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
            }
            
            setShowCreateModal(false);
            setShowEditModal(false);
            setEditingType(null);
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-black mb-4">Delete Discount Type</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete &quot;{typeToDelete?.name}&quot;? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleDeleteCancel}
                className="px-4 py-2 text-gray-600 hover:text-black border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

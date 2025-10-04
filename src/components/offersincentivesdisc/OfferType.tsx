'use client';

import React, { useState } from 'react';
import { Target, Percent, DollarSign, Gift, Settings, Plus, Edit, Trash2, TrendingUp } from 'lucide-react';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';
import { useUserStore } from '@/store/userStore';

interface OfferTypeProps {
  isNewOffer?: boolean;
}

interface OfferType {
  id: string;
  name: string;
  description: string;
  discountType: 'percentage' | 'fixed' | 'buy_x_get_y';
  discountValue: number;
  minOrderValue?: number;
  minQuantity?: number;
  maxUsage?: number;
  perCustomerLimit?: number;
  isActive: boolean;
  createdAt: string;
}

export default function OfferType({ isNewOffer = false }: OfferTypeProps) {
  const user = useUserStore(state => state.user);
  const userCurrency = user?.currency || getDefaultCurrency();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingType, setEditingType] = useState<OfferType | null>(null);

  // Mock data - replace with actual API calls
  const offerTypes: OfferType[] = [
    {
      id: '1',
      name: 'Percentage Discount',
      description: 'Standard percentage-based discount on products',
      discountType: 'percentage',
      discountValue: 15,
      minOrderValue: 100000,
      maxUsage: 1000,
      perCustomerLimit: 5,
      isActive: true,
      createdAt: '2024-01-15',
    },
    {
      id: '2',
      name: 'Fixed Amount Discount',
      description: 'Fixed monetary discount on orders',
      discountType: 'fixed',
      discountValue: 50000,
      minOrderValue: 200000,
      maxUsage: 500,
      perCustomerLimit: 3,
      isActive: true,
      createdAt: '2024-01-20',
    },
    {
      id: '3',
      name: 'Buy X Get Y',
      description: 'Buy certain quantity, get additional items free',
      discountType: 'buy_x_get_y',
      discountValue: 1, // Get 1 free when buying X
      minQuantity: 5,
      maxUsage: 200,
      perCustomerLimit: 2,
      isActive: false,
      createdAt: '2024-02-01',
    },
  ];

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
    // Implement delete functionality
    console.log('Delete offer type:', typeId);
  };

  const handleToggleActive = (typeId: string) => {
    // Implement toggle active functionality
    console.log('Toggle active for type:', typeId);
  };

  // New offer state - show create button and form
  if (isNewOffer) {
    return (
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-black">Offer Type Configuration</h2>
            <p className="text-gray-500 text-sm">Configure the discount or promotion type for your new offer</p>
          </div>
        </div>

        {/* Empty State with Create Button */}
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Target className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Offer Type Configured</h3>
          <p className="text-gray-500 text-sm mb-4">
            Create an offer type to define the discount or promotion rules for your offer.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-6 py-3 bg-[#0a61d7] text-white rounded-lg hover:bg-[#084ba6] transition-colors mx-auto"
          >
            <Plus className="w-4 h-4" />
            Create Type
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-black">Offer Types</h2>
          <p className="text-gray-500 text-sm">Configure different types of discounts and promotions</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0a61d7] text-white font-semibold hover:bg-[#084ba6] transition text-sm"
        >
          <Plus className="w-4 h-4" />
          Create Type
        </button>
      </div>

      {/* Quick Stats */}
      <div className="w-full mx-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <div className="flex flex-col justify-between p-4 rounded-lg shadow bg-white border border-[#e6e6e6] bg-[#f7faff]">
          <div className="flex items-center gap-4 border-b border-gray-200 pb-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-white shadow-sm">
              <Percent className="w-6 h-6 text-[#0a61d7]" />
            </div>
            <div>
              <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Percentage Discounts</div>
              <div className="text-xl font-bold text-black">
                {offerTypes.filter(t => t.discountType === 'percentage').length}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 ml-1">
            <TrendingUp className="w-5 h-5 text-[#3ea73b]" />
            <span className="text-[#3ea73b] text-xs font-semibold">+3%</span>
            <span className="text-gray-400 text-xs">from last month</span>
          </div>
        </div>

        <div className="flex flex-col justify-between p-4 rounded-lg shadow bg-white border border-[#e6e6e6] bg-[#e6f7ec]">
          <div className="flex items-center gap-4 border-b border-gray-200 pb-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-white shadow-sm">
              <DollarSign className="w-6 h-6 text-green-500" />
            </div>
            <div>
              <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Fixed Discounts</div>
              <div className="text-xl font-bold text-black">
                {offerTypes.filter(t => t.discountType === 'fixed').length}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 ml-1">
            <TrendingUp className="w-5 h-5 text-[#3ea73b]" />
            <span className="text-[#3ea73b] text-xs font-semibold">+1%</span>
            <span className="text-gray-400 text-xs">from last month</span>
          </div>
        </div>

        <div className="flex flex-col justify-between p-4 rounded-lg shadow bg-white border border-[#e6e6e6] bg-[#f3f0ff]">
          <div className="flex items-center gap-4 border-b border-gray-200 pb-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-white shadow-sm">
              <Gift className="w-6 h-6 text-purple-500" />
            </div>
            <div>
              <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Special Offers</div>
              <div className="text-xl font-bold text-black">
                {offerTypes.filter(t => t.discountType === 'buy_x_get_y').length}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 ml-1">
            <TrendingUp className="w-5 h-5 text-[#3ea73b]" />
            <span className="text-[#3ea73b] text-xs font-semibold">+2%</span>
            <span className="text-gray-400 text-xs">from last month</span>
          </div>
        </div>
      </div>

      {/* Offer Types Grid */}
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

              {type.minOrderValue && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">Min. Order:</span>
                  <span className="font-medium text-black text-xs">
                    {formatCurrency(type.minOrderValue, userCurrency)}
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

      {/* Create/Edit Modal Placeholder */}
      {(showCreateModal || showEditModal) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-black">
                {showCreateModal ? 'Create New Offer Type' : 'Edit Offer Type'}
              </h3>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setShowEditModal(false);
                  setEditingType(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>
            <div className="text-gray-500 text-center py-8">
              Offer type creation/edit form will be implemented here
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import { Target, Percent, DollarSign, Gift, Settings, Plus, Edit, Trash2 } from 'lucide-react';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';
import { useUserStore } from '@/store/userStore';

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

export default function OfferType() {
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

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-black">Offer Types</h2>
          <p className="text-gray-500 text-sm">Configure different types of discounts and promotions</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#084ba6] transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Type
        </button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <div className="flex items-center gap-3">
            <Percent className="w-8 h-8 text-blue-600" />
            <div>
              <p className="text-sm text-blue-600 font-medium">Percentage Discounts</p>
              <p className="text-2xl font-bold text-blue-800">
                {offerTypes.filter(t => t.discountType === 'percentage').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
          <div className="flex items-center gap-3">
            <DollarSign className="w-8 h-8 text-green-600" />
            <div>
              <p className="text-sm text-green-600 font-medium">Fixed Discounts</p>
              <p className="text-2xl font-bold text-green-800">
                {offerTypes.filter(t => t.discountType === 'fixed').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
          <div className="flex items-center gap-3">
            <Gift className="w-8 h-8 text-purple-600" />
            <div>
              <p className="text-sm text-purple-600 font-medium">Special Offers</p>
              <p className="text-2xl font-bold text-purple-800">
                {offerTypes.filter(t => t.discountType === 'buy_x_get_y').length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Offer Types Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {offerTypes.map((type) => (
          <div key={type.id} className={`p-6 rounded-lg border-2 ${getDiscountTypeColor(type.discountType)}`}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                {getDiscountTypeIcon(type.discountType)}
                <div>
                  <h3 className="text-lg font-semibold text-black">{type.name}</h3>
                  <p className="text-sm text-gray-600">{type.description}</p>
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
                <span className="text-sm text-gray-600">Discount Value:</span>
                <span className="font-medium text-black">
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
                  <span className="text-sm text-gray-600">Min. Order:</span>
                  <span className="font-medium text-black">
                    {formatCurrency(type.minOrderValue, userCurrency)}
                  </span>
                </div>
              )}

              {type.minQuantity && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Min. Quantity:</span>
                  <span className="font-medium text-black">{type.minQuantity} items</span>
                </div>
              )}

              {type.maxUsage && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Max Usage:</span>
                  <span className="font-medium text-black">{type.maxUsage}</span>
                </div>
              )}

              {type.perCustomerLimit && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Per Customer:</span>
                  <span className="font-medium text-black">{type.perCustomerLimit} times</span>
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
                  className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-100 rounded-lg transition-colors"
                  title="Edit Type"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(type.id)}
                  className="p-2 text-red-600 hover:text-red-700 hover:bg-red-100 rounded-lg transition-colors"
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

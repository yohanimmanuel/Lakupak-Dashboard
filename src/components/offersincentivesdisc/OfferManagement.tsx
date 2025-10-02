'use client';

import React, { useState } from 'react';
import { Plus, Edit, Trash2, Eye, Copy, Calendar, Target, DollarSign, Users, Settings, TrendingUp } from 'lucide-react';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';
import { useUserStore } from '@/store/userStore';

interface Offer {
  id: string;
  name: string;
  type: 'discount' | 'promotion';
  status: 'active' | 'inactive' | 'expired';
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  startDate: string;
  endDate: string;
  totalUsage: number;
  maxUsage?: number;
  createdAt: string;
}

export default function OfferManagement() {
  const user = useUserStore(state => state.user);
  const userCurrency = user?.currency || getDefaultCurrency();
  const [selectedOffers, setSelectedOffers] = useState<string[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingOffer, setEditingOffer] = useState<Offer | null>(null);

  // Mock data - replace with actual API calls
  const offers: Offer[] = [
    {
      id: '1',
      name: 'Summer Sale 2024',
      type: 'promotion',
      status: 'active',
      discountType: 'percentage',
      discountValue: 20,
      startDate: '2024-06-01',
      endDate: '2024-08-31',
      totalUsage: 89,
      maxUsage: 200,
      createdAt: '2024-05-15',
    },
    {
      id: '2',
      name: 'Bulk Discount',
      type: 'discount',
      status: 'active',
      discountType: 'fixed',
      discountValue: 50000,
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      totalUsage: 67,
      maxUsage: 500,
      createdAt: '2024-01-01',
    },
    {
      id: '3',
      name: 'New Customer Special',
      type: 'promotion',
      status: 'inactive',
      discountType: 'percentage',
      discountValue: 15,
      startDate: '2024-03-01',
      endDate: '2024-04-30',
      totalUsage: 45,
      maxUsage: 100,
      createdAt: '2024-02-20',
    },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800 border border-green-200';
      case 'inactive':
        return 'bg-gray-100 text-gray-800 border border-gray-200';
      case 'expired':
        return 'bg-red-100 text-red-800 border border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border border-gray-200';
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'discount':
        return 'bg-blue-100 text-blue-800 border border-blue-200';
      case 'promotion':
        return 'bg-purple-100 text-purple-800 border border-purple-200';
      default:
        return 'bg-gray-100 text-gray-800 border border-gray-200';
    }
  };

  const handleOfferSelect = (offerId: string) => {
    setSelectedOffers(prev => 
      prev.includes(offerId) 
        ? prev.filter(id => id !== offerId)
        : [...prev, offerId]
    );
  };

  const handleRowClick = (offerId: string, event: React.MouseEvent) => {
    if ((event.target as HTMLElement).closest('button') || (event.target as HTMLElement).closest('th')) {
      return;
    }
    handleOfferSelect(offerId);
  };

  const handleSelectAll = () => {
    if (selectedOffers.length === offers.length) {
      setSelectedOffers([]);
    } else {
      setSelectedOffers(offers.map(offer => offer.id));
    }
  };

  const handleEdit = (offer: Offer) => {
    setEditingOffer(offer);
    setShowEditModal(true);
  };

  const handleDelete = (offerId: string) => {
    // Implement delete functionality
    console.log('Delete offer:', offerId);
  };

  const handleDuplicate = (offer: Offer) => {
    // Implement duplicate functionality
    console.log('Duplicate offer:', offer);
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-black">Offer Management</h2>
          <p className="text-gray-500 text-sm">Create, edit, and manage your offers</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#084ba6] transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Offer
        </button>
      </div>

      {/* Quick Stats */}
      <div className="w-full mx-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="flex flex-col justify-between p-4 rounded-lg shadow bg-white border border-[#e6e6e6] bg-[#f7faff]">
          <div className="flex items-center gap-4 border-b border-gray-200 pb-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-white shadow-sm">
              <Target className="w-6 h-6 text-[#0a61d7]" />
            </div>
            <div>
              <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Total Offers</div>
              <div className="text-xl font-bold text-black">{offers.length}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 ml-1">
            <TrendingUp className="w-5 h-5 text-[#3ea73b]" />
            <span className="text-[#3ea73b] text-xs font-semibold">+8%</span>
            <span className="text-gray-400 text-xs">from last month</span>
          </div>
        </div>

        <div className="flex flex-col justify-between p-4 rounded-lg shadow bg-white border border-[#e6e6e6] bg-[#e6f7ec]">
          <div className="flex items-center gap-4 border-b border-gray-200 pb-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-white shadow-sm">
              <Calendar className="w-6 h-6 text-green-500" />
            </div>
            <div>
              <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Active Offers</div>
              <div className="text-xl font-bold text-black">
                {offers.filter(o => o.status === 'active').length}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 ml-1">
            <TrendingUp className="w-5 h-5 text-[#3ea73b]" />
            <span className="text-[#3ea73b] text-xs font-semibold">67%</span>
            <span className="text-gray-400 text-xs">active rate</span>
          </div>
        </div>

        <div className="flex flex-col justify-between p-4 rounded-lg shadow bg-white border border-[#e6e6e6] bg-[#fff7ed]">
          <div className="flex items-center gap-4 border-b border-gray-200 pb-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-white shadow-sm">
              <Users className="w-6 h-6 text-orange-500" />
            </div>
            <div>
              <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Total Usage</div>
              <div className="text-xl font-bold text-black">
                {offers.reduce((sum, offer) => sum + offer.totalUsage, 0)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 ml-1">
            <TrendingUp className="w-5 h-5 text-[#3ea73b]" />
            <span className="text-[#3ea73b] text-xs font-semibold">+15%</span>
            <span className="text-gray-400 text-xs">from last month</span>
          </div>
        </div>

        <div className="flex flex-col justify-between p-4 rounded-lg shadow bg-white border border-[#e6e6e6] bg-[#f3f0ff]">
          <div className="flex items-center gap-4 border-b border-gray-200 pb-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-white shadow-sm">
              <DollarSign className="w-6 h-6 text-purple-500" />
            </div>
            <div>
              <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Avg. Discount</div>
              <div className="text-xl font-bold text-black">
                {offers.length > 0 ? 
                  Math.round(offers.reduce((sum, offer) => sum + offer.discountValue, 0) / offers.length) : 0
                }%
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 ml-1">
            <TrendingUp className="w-5 h-5 text-[#3ea73b]" />
            <span className="text-[#3ea73b] text-xs font-semibold">+5%</span>
            <span className="text-gray-400 text-xs">from last month</span>
          </div>
        </div>
      </div>

      {/* Offers Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-black">All Offers</h3>
            {selectedOffers.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">{selectedOffers.length} selected</span>
                <button className="px-3 py-1 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded">
                  Delete Selected
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-3 px-4 font-medium text-xs uppercase text-gray-500">
                  <button
                    onClick={handleSelectAll}
                    className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                      selectedOffers.length === offers.length && offers.length > 0
                        ? 'bg-green-500 border-green-500'
                        : 'bg-white border-gray-300 hover:border-green-400'
                    }`}
                  >
                    {selectedOffers.length === offers.length && offers.length > 0 && (
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                </th>
                <th className="text-left py-3 px-4 font-medium text-xs uppercase text-gray-500">Offer Details</th>
                <th className="text-left py-3 px-4 font-medium text-xs uppercase text-gray-500">Type & Status</th>
                <th className="text-left py-3 px-4 font-medium text-xs uppercase text-gray-500">Discount</th>
                <th className="text-left py-3 px-4 font-medium text-xs uppercase text-gray-500">Usage</th>
                <th className="text-left py-3 px-4 font-medium text-xs uppercase text-gray-500">Date Range</th>
                <th className="text-left py-3 px-4 font-medium text-xs uppercase text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {offers.map((offer) => (
                <tr 
                  key={offer.id} 
                  className={`border-b border-gray-100 hover:bg-gray-50 text-xs transition cursor-pointer ${
                    selectedOffers.includes(offer.id) 
                      ? 'bg-blue-50' 
                      : ''
                  }`}
                  onClick={(e) => handleRowClick(offer.id, e)}
                >
                  <td className="py-4 px-4">
                    <button
                      onClick={() => handleOfferSelect(offer.id)}
                      className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                        selectedOffers.includes(offer.id)
                          ? 'bg-green-500 border-green-500'
                          : 'bg-white border-gray-300 hover:border-green-400'
                      }`}
                    >
                      {selectedOffers.includes(offer.id) && (
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  </td>
                  
                  <td className="py-4 px-4">
                    <div>
                      <div className="font-medium text-black">{offer.name}</div>
                      <div className="text-xs text-gray-500">Created: {new Date(offer.createdAt).toLocaleDateString()}</div>
                    </div>
                  </td>
                  
                  <td className="py-4 px-4">
                    <div className="flex flex-col gap-1">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getTypeBadge(offer.type)}`}>
                        {offer.type}
                      </span>
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(offer.status)}`}>
                        {offer.status}
                      </span>
                    </div>
                  </td>
                  
                  <td className="py-4 px-4">
                    <div className="font-medium text-black">
                      {offer.discountType === 'percentage' 
                        ? `${offer.discountValue}%` 
                        : formatCurrency(offer.discountValue, userCurrency)
                      }
                    </div>
                  </td>
                  
                  <td className="py-4 px-4">
                    <div>
                      <div className="font-medium text-black">{offer.totalUsage}</div>
                      {offer.maxUsage && (
                        <div className="text-xs text-gray-500">of {offer.maxUsage}</div>
                      )}
                    </div>
                  </td>
                  
                  <td className="py-4 px-4">
                    <div className="text-xs text-gray-600">
                      <div>{new Date(offer.startDate).toLocaleDateString()}</div>
                      <div>to {new Date(offer.endDate).toLocaleDateString()}</div>
                    </div>
                  </td>
                  
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleEdit(offer)}
                        className="p-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                        title="Edit Offer"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDuplicate(offer)}
                        className="p-1.5 text-gray-600 hover:text-gray-700 hover:bg-gray-50 rounded transition-colors"
                        title="Duplicate Offer"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Modal Placeholder */}
      {(showCreateModal || showEditModal) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-black">
                {showCreateModal ? 'Create New Offer' : 'Edit Offer'}
              </h3>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setShowEditModal(false);
                  setEditingOffer(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>
            <div className="text-gray-500 text-center py-8">
              Offer creation/edit form will be implemented here
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

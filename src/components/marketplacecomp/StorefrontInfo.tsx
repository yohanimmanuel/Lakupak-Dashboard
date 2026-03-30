'use client';

import React from 'react';
import Link from 'next/link';
import { Store, Truck, Package, DollarSign, Clock, Settings, ExternalLink } from 'lucide-react';
import { generateSlug } from '@/utils/slugUtils';


interface Product {
  returnPolicyDays?: number;
}

interface Company {
  name?: string;
  logo?: string;
  bannerImage?: string;
  businessAddress?: string;
  businessPhone?: string;
  businessEmail?: string;
  pickupAddress?: string;
  shippingPreferences?: string;
  defaultDeliveryLeadTimeMinDays?: number;
  defaultDeliveryLeadTimeMaxDays?: number;
}

interface StorefrontInfoProps {
  company?: Company;
  userCurrency?: string;
  products?: Product[];
}

export default function StorefrontInfo({ 
  company, 
  userCurrency = 'IDR',
  products = []
}: StorefrontInfoProps) {
  // Default values if no company data
  const storeName = company?.name || 'Your Store Name';
  const storeAddress = company?.businessAddress || 'Not set';
  const storePhone = company?.businessPhone || 'Not set';
  const storeEmail = company?.businessEmail || 'Not set';
  
  // Generate proper URL slug from store name
  const storeSlug = generateSlug(storeName);
  
  // Shipping info
  const pickupAddress = company?.pickupAddress || 'Not set';
  const shippingPreferences: string[] = (() => {
    try {
      return JSON.parse(company?.shippingPreferences || '[]');
    } catch {
      return [];
    }
  })();
  const leadTimeMin = company?.defaultDeliveryLeadTimeMinDays;
  const leadTimeMax = company?.defaultDeliveryLeadTimeMaxDays;

  const ALL_SHIPPING_OPTIONS = [
    { key: 'Self Pickup', label: 'Self Pickup (Buyer collects)' },
    { key: 'Seller/Distributor Delivery', label: 'Seller / Distributor Delivery' },
    { key: 'Buyer-arranged Courier', label: 'Buyer-arranged Courier' },
  ];

  // Calculate highest return policy from products
  const maxReturnPolicy = products.reduce((max, product) => {
    const days = product.returnPolicyDays || 0;
    return days > max ? days : max;
  }, 7); // Default to 7 days if no products have return policy

  return (
    <div className="bg-white rounded-lg border border-[#e6e6e6]">
      {/* Header */}
      <div className="p-4 border-b border-[#e6e6e6] flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Store className="w-5 h-5 text-[#0a61d7]" />
            Storefront Information
          </h2>
          <p className="text-sm text-gray-600">View your marketplace store settings</p>
        </div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-[#0a61d7] hover:text-[#084ba6] transition-colors"
        >
          <Settings className="w-4 h-4" />
          Edit in Settings
          <ExternalLink className="w-4 h-4" />
        </Link>
      </div>

      <div className="p-4 space-y-4">
        {/* Store Information */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Store className="w-4 h-4 text-gray-600" />
            Store Details
          </h3>
          <div className="bg-white border border-[#e6e6e6] rounded-lg p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-600 mb-1">Store Name</p>
                <p className="text-sm font-semibold text-gray-900">{storeName}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 mb-1">Store URL</p>
                <p className="text-sm font-semibold text-[#0a61d7]">
                  laku.marketplace/{storeSlug || 'your-store'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-600 mb-1">Contact Phone</p>
                <p className="text-sm font-semibold text-gray-900">{storePhone}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 mb-1">Contact Email</p>
                <p className="text-sm font-semibold text-gray-900">{storeEmail}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-xs text-gray-600 mb-1">Store Address</p>
                <p className="text-sm font-semibold text-gray-900">{storeAddress}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Shipping Information */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Truck className="w-4 h-4 text-gray-600" />
            Shipping Options
          </h3>
          <div className="bg-white border border-[#e6e6e6] rounded-lg p-4 space-y-4">
            {/* Pickup Address */}
            <div className="flex items-center justify-between py-2 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-gray-600" />
                <span className="text-sm text-gray-900">Pickup Address</span>
              </div>
              <span className="text-sm font-semibold text-gray-900">{pickupAddress}</span>
            </div>

            {/* Available shipping options */}
            <div className="space-y-2">
              <p className="text-xs text-gray-500 mb-1">Available shipping methods (shipping costs agreed between parties)</p>
              {ALL_SHIPPING_OPTIONS.map(({ key, label }) => {
                const enabled = shippingPreferences.includes(key);
                return (
                  <div key={key} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4 text-gray-500" />
                      <span className={`text-sm ${enabled ? 'text-gray-900' : 'text-gray-400'}`}>{label}</span>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                      {enabled ? 'Available' : 'Not offered'}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Lead time */}
            {(leadTimeMin != null || leadTimeMax != null) && (
              <div className="flex items-center justify-between py-2 border-t border-gray-200 pt-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-900">Default Lead Time</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">
                  {leadTimeMin ?? '?'}–{leadTimeMax ?? '?'} days
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Customer Experience */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Settings className="w-4 h-4 text-gray-600" />
            Customer Experience
          </h3>
          <div className="bg-white border border-[#e6e6e6] rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-900">Return Policy</span>
              <span className="text-sm font-semibold text-gray-900">{maxReturnPolicy} days</span>
            </div>
          </div>
        </div>

        {/* Note */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-xs text-blue-800">
            <strong>Note:</strong> These settings are read-only in the marketplace view. 
            To update store information, shipping rates, or customer experience settings, 
            please visit the <Link href="/settings" className="font-semibold underline hover:text-blue-900">Settings page</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}

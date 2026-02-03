'use client';

import React from 'react';
import Link from 'next/link';
import { Store, Truck, Package, DollarSign, Clock, Settings, ExternalLink } from 'lucide-react';
import { generateSlug } from '@/utils/slugUtils';
import { formatCurrency } from '@/utils/currencyUtils';

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
  baseShippingPrice?: number;
  baseShippingRadius?: number;
  freeShippingThreshold?: number;
  sameDayShippingPrice?: number;
  nextDayShippingPrice?: number;
  expressShippingPrice?: number;
  maxShippingRadius?: number;
  additionalPricePerKm?: number;
  pickupAddress?: string;
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
  const freeShippingThreshold = company?.freeShippingThreshold || 0;
  const baseShippingPrice = company?.baseShippingPrice || 0;
  const sameDayShipping = company?.sameDayShippingPrice || 0;
  const nextDayShipping = company?.nextDayShippingPrice || 0;
  const expressShipping = company?.expressShippingPrice || 0;
  const additionalPricePerKm = company?.additionalPricePerKm || 0;
  const baseShippingRadius = company?.baseShippingRadius || 0;
  const maxShippingRadius = company?.maxShippingRadius || 0;
  const pickupAddress = company?.pickupAddress || 'Not set';

  // Calculate highest return policy from products
  const maxReturnPolicy = products.reduce((max, product) => {
    const days = product.returnPolicyDays || 0;
    return days > max ? days : max;
  }, 7); // Default to 7 days if no products have return policy

  // Format price using user's currency
  const formatPrice = (amount: number) => {
    return formatCurrency(amount, userCurrency);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
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

      <div className="p-6 space-y-6">
        {/* Store Information */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Store className="w-4 h-4 text-gray-600" />
            Store Details
          </h3>
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
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
            Shipping Configuration
          </h3>
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            {/* Standard Shipping */}
            {baseShippingPrice > 0 && (
              <div className="flex items-center justify-between py-2 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-gray-600" />
                  <span className="text-sm text-gray-900">Standard Shipping</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">{formatPrice(baseShippingPrice)}</span>
              </div>
            )}

            {/* Base Shipping Radius */}
            {baseShippingRadius > 0 && (
              <div className="flex items-center justify-between py-2 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-gray-600" />
                  <span className="text-sm text-gray-900">Base Shipping Radius</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">{baseShippingRadius} km</span>
              </div>
            )}

            {/* Additional Price Per KM */}
            {additionalPricePerKm > 0 && (
              <div className="flex items-center justify-between py-2 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-gray-600" />
                  <span className="text-sm text-gray-900">Additional Price per KM</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">{formatPrice(additionalPricePerKm)}</span>
              </div>
            )}

            {/* Max Shipping Radius */}
            {maxShippingRadius > 0 && (
              <div className="flex items-center justify-between py-2 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-gray-600" />
                  <span className="text-sm text-gray-900">Maximum Shipping Radius</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">{maxShippingRadius} km</span>
              </div>
            )}
            
            {/* Free Shipping Threshold */}
            <div className="flex items-center justify-between py-2 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-green-600" />
                <span className="text-sm text-gray-900">Free Shipping Threshold</span>
              </div>
              <span className="text-sm font-semibold text-green-600">
                {freeShippingThreshold > 0 ? formatPrice(freeShippingThreshold) : 'Not set'}
              </span>
            </div>

            {/* Same-Day Delivery */}
            {sameDayShipping > 0 && (
              <div className="flex items-center justify-between py-2 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-600" />
                  <span className="text-sm text-gray-900">Same-Day Delivery</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">{formatPrice(sameDayShipping)}</span>
              </div>
            )}

            {/* Next-Day Delivery */}
            {nextDayShipping > 0 && (
              <div className="flex items-center justify-between py-2 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-600" />
                  <span className="text-sm text-gray-900">Next-Day Delivery</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">{formatPrice(nextDayShipping)}</span>
              </div>
            )}

            {/* Express Shipping */}
            {expressShipping > 0 && (
              <div className="flex items-center justify-between py-2 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-purple-600" />
                  <span className="text-sm text-gray-900">Express Delivery</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">{formatPrice(expressShipping)}</span>
              </div>
            )}

            {/* Pickup Address */}
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-gray-600" />
                <span className="text-sm text-gray-900">Pickup Address</span>
              </div>
              <span className="text-sm font-semibold text-gray-900">{pickupAddress}</span>
            </div>
          </div>
        </div>

        {/* Customer Experience */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Settings className="w-4 h-4 text-gray-600" />
            Customer Experience
          </h3>
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
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

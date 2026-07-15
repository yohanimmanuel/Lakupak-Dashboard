'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { Store, Truck, Package, Clock, Settings, Users } from 'lucide-react';
import { generateSlug } from '@/utils/slugUtils';
import { useMarketplaceTranslations } from '@/hooks/useMarketplaceTranslations';

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

export interface DistributorInfoProps {
  company?: Company;
  userCurrency?: string;
  products?: Product[];
  buyersCount?: number;
  followersCount?: number;
}

const SHIPPING_OPTION_KEYS = [
  'Self Pickup',
  'Seller/Distributor Delivery',
  'Buyer-arranged Courier',
] as const;

export default function DistributorInfo({
  company,
  userCurrency: _userCurrency = 'IDR',
  products = [],
  buyersCount = 0,
  followersCount = 0,
}: DistributorInfoProps) {
  const { tDistributor, tShared, translateShippingOption } = useMarketplaceTranslations();

  const distributorName = company?.name || tShared('defaultDistributorName');
  const distributorAddress = company?.businessAddress || tShared('notSet');
  const distributorPhone = company?.businessPhone || tShared('notSet');
  const distributorEmail = company?.businessEmail || tShared('notSet');

  const distributorSlug = generateSlug(distributorName);

  const buyersLabel = useMemo(() => `${buyersCount}`, [buyersCount]);
  const followersLabel = useMemo(() => `${followersCount}`, [followersCount]);

  const pickupAddress = company?.pickupAddress || tShared('notSet');
  const shippingPreferences: string[] = (() => {
    try {
      return JSON.parse(company?.shippingPreferences || '[]');
    } catch {
      return [];
    }
  })();
  const leadTimeMin = company?.defaultDeliveryLeadTimeMinDays;
  const leadTimeMax = company?.defaultDeliveryLeadTimeMaxDays;

  const maxReturnPolicy = products.reduce((max, product) => {
    const days = product.returnPolicyDays || 0;
    return days > max ? days : max;
  }, 7);

  return (
    <div className="bg-white rounded-lg border border-[#e6e6e6]">
      <div className="p-4 border-b border-[#e6e6e6] flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Store className="w-5 h-5 text-[#0a61d7]" />
            {tDistributor('title')}
          </h2>
        </div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-2 px-2 py-2 text-sm font-medium text-[#0a61d7] hover:text-[#084ba6] transition-colors"
        >
          <Settings className="w-4 h-4" />
          {tDistributor('editSettings')}
        </Link>
      </div>

      <div className="p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-600" />
            {tDistributor('customers')}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg bg-blue-50 border border-blue-100 p-4">
              <p className="text-xs text-gray-600">{tDistributor('buyers')}</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{buyersLabel}</p>
              <p className="text-xs text-gray-500 mt-1">{tDistributor('uniqueBuyers')}</p>
            </div>
            <div className="rounded-lg bg-blue-50 border border-blue-100 p-4">
              <p className="text-xs text-gray-600">{tDistributor('followers')}</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{followersLabel}</p>
              <p className="text-xs text-gray-500 mt-1">{tDistributor('marketplaceFollowers')}</p>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Store className="w-4 h-4 text-gray-600" />
            {tDistributor('details')}
          </h3>
          <div className="bg-white border border-[#e6e6e6] rounded-lg p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-600 mb-1">{tDistributor('distributorName')}</p>
                <p className="text-sm font-semibold text-gray-900">{distributorName}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 mb-1">{tDistributor('marketplaceUrl')}</p>
                <p className="text-sm font-semibold text-[#0a61d7]">
                  laku.marketplace/{distributorSlug || 'your-distributor'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-600 mb-1">{tDistributor('contactPhone')}</p>
                <p className="text-sm font-semibold text-gray-900">{distributorPhone}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 mb-1">{tDistributor('contactEmail')}</p>
                <p className="text-sm font-semibold text-gray-900">{distributorEmail}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-xs text-gray-600 mb-1">{tDistributor('businessAddress')}</p>
                <p className="text-sm font-semibold text-gray-900">{distributorAddress}</p>
              </div>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Truck className="w-4 h-4 text-gray-600" />
            {tDistributor('shippingOptions')}
          </h3>
          <div className="bg-white border border-[#e6e6e6] rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between py-2 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-gray-600" />
                <span className="text-sm text-gray-900">{tDistributor('pickupAddress')}</span>
              </div>
              <span className="text-sm font-semibold text-gray-900">{pickupAddress}</span>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-gray-500 mb-1">
                {tDistributor('shippingMethodsHint')}
              </p>
              {SHIPPING_OPTION_KEYS.map((key) => {
                const enabled = shippingPreferences.includes(key);
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4 text-gray-500" />
                      <span className={`text-sm ${enabled ? 'text-gray-900' : 'text-gray-400'}`}>
                        {translateShippingOption(key)}
                      </span>
                    </div>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}
                    >
                      {enabled ? tShared('available') : tShared('notOffered')}
                    </span>
                  </div>
                );
              })}
            </div>

            {(leadTimeMin != null || leadTimeMax != null) && (
              <div className="flex items-center justify-between py-2 border-t border-gray-200 pt-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-900">{tDistributor('defaultLeadTime')}</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">
                  {tShared('daysRange', {
                    min: leadTimeMin ?? '?',
                    max: leadTimeMax ?? '?',
                  })}
                </span>
              </div>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Settings className="w-4 h-4 text-gray-600" />
            {tDistributor('customerExperience')}
          </h3>
          <div className="bg-white border border-[#e6e6e6] rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-900">{tDistributor('returnPolicy')}</span>
              <span className="text-sm font-semibold text-gray-900">
                {maxReturnPolicy} {tShared('days')}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-xs text-blue-800">
            <strong>{tDistributor('readOnlyNoteLabel')}:</strong>{' '}
            {tDistributor('readOnlyNoteBody')}{' '}
            <Link href="/settings" className="font-semibold underline hover:text-blue-900">
              {tDistributor('settingsPage')}
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

'use client';

import { Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { formatCurrency } from '@/components/analyticsperformance/FinancialAnalytics';

export type BuyerInsightRow = {
  buyerId: string;
  name: string;
  orders: number;
  revenue: number;
  pieces: number;
  status: string;
};

type BuyersWidgetProps = {
  totalBuyers: number;
  activeBuyers: number;
  topBuyers: BuyerInsightRow[];
  avgOrderValue: number;
  totalOrders: number;
  totalPiecesSold: number;
  totalUnitsSold: number;
  userCurrency: string;
  translateRecordStatus: (status: string) => string;
};

export default function BuyersWidget({
  totalBuyers,
  activeBuyers,
  topBuyers,
  avgOrderValue,
  totalOrders,
  totalPiecesSold,
  totalUnitsSold,
  userCurrency,
  translateRecordStatus,
}: BuyersWidgetProps) {
  const t = useTranslations('dashboard.home.widgets.buyers');
  const tCommon = useTranslations('dashboard.common');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2 @lg:grid-cols-3">
        <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
          <p className="text-xs text-gray-500">{t('totalBuyers')}</p>
          <p className="mt-1 text-xl font-semibold text-black">{totalBuyers.toLocaleString()}</p>
          <p className="mt-1 text-[11px] uppercase tracking-wide text-gray-500">
            {tCommon('active')}:{' '}
            <span className="font-semibold text-black">{activeBuyers.toLocaleString()}</span>
          </p>
        </div>
        <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
          <p className="text-xs text-gray-500">{t('avgOrderValue')}</p>
          <p className="mt-1 text-xl font-semibold text-black">
            {formatCurrency(avgOrderValue, userCurrency)}
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-wide text-gray-500">
            {t('acrossOrders', { count: totalOrders.toLocaleString() })}
          </p>
        </div>
        <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
          <p className="text-xs text-gray-500">{t('piecesSold')}</p>
          <p className="mt-1 text-xl font-semibold text-black">
            {totalPiecesSold.toLocaleString()}
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-wide text-gray-500">
            {tCommon('units')} {totalUnitsSold.toLocaleString()}
          </p>
        </div>
      </div>
      {topBuyers.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center rounded-lg">
          <Users className="mb-3 h-8 w-8 text-gray-300" />
          <p className="text-sm font-semibold text-gray-600">{t('emptyTitle')}</p>
          <p className="mt-1 text-xs text-gray-500">{t('emptyHint')}</p>
        </div>
      ) : (
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t('topBuyers')}
          </h3>
          <ul className="space-y-3">
            {topBuyers.map((buyer, index) => (
              <li
                key={buyer.buyerId}
                className="flex items-center justify-between rounded-lg border border-[#e6e6e6] bg-white px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f7faff] text-xs font-semibold text-[#0a61d7]">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-black">{buyer.name}</p>
                    <p className="text-xs text-gray-500">{translateRecordStatus(buyer.status)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <div className="text-right">
                    <p className="text-xs text-gray-500">{tCommon('orders')}</p>
                    <p className="font-semibold text-black">{buyer.orders.toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">{tCommon('revenue')}</p>
                    <p className="font-semibold text-black">
                      {formatCurrency(buyer.revenue, userCurrency)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">{tCommon('pieces')}</p>
                    <p className="font-semibold text-black">{buyer.pieces.toLocaleString()}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

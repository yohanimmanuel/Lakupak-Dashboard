'use client';

import { Building2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { formatCurrency } from '@/components/analyticsperformance/FinancialAnalytics';

export type SupplierInsightRow = {
  supplierId: string;
  name: string;
  value: number;
  status: string;
};

type SuppliersWidgetProps = {
  totalSuppliers: number;
  activeSuppliers: number;
  onTimeRate: number;
  topSuppliers: SupplierInsightRow[];
  userCurrency: string;
  translateRecordStatus: (status: string) => string;
};

export default function SuppliersWidget({
  totalSuppliers,
  activeSuppliers,
  onTimeRate,
  topSuppliers,
  userCurrency,
  translateRecordStatus,
}: SuppliersWidgetProps) {
  const t = useTranslations('dashboard.home.widgets.suppliers');
  const tCommon = useTranslations('dashboard.common');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2 @lg:grid-cols-3">
        <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
          <p className="text-xs text-gray-500">{t('totalSuppliers')}</p>
          <p className="mt-1 text-xl font-semibold text-black">
            {totalSuppliers.toLocaleString()}
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-wide text-gray-500">
            {tCommon('active')}:{' '}
            <span className="font-semibold text-black">{activeSuppliers.toLocaleString()}</span>
          </p>
        </div>
        <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
          <p className="text-xs text-gray-500">{t('onTimeDelivery')}</p>
          <p className="mt-1 text-xl font-semibold text-black">{onTimeRate}%</p>
          <p className="mt-1 text-[11px] uppercase tracking-wide text-emerald-600">{t('goal')}</p>
        </div>
        <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
          <p className="text-xs text-gray-500">{t('topSupplierValue')}</p>
          <p className="mt-1 text-xl font-semibold text-black">
            {formatCurrency(topSuppliers[0]?.value ?? 0, userCurrency)}
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-wide text-gray-500">
            {topSuppliers[0]?.name ?? '—'}
          </p>
        </div>
      </div>
      {topSuppliers.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center rounded-lg">
          <Building2 className="mb-3 h-8 w-8 text-gray-300" />
          <p className="text-sm font-semibold text-gray-600">{t('emptyTitle')}</p>
          <p className="mt-1 text-xs text-gray-500">{t('emptyHint')}</p>
        </div>
      ) : (
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t('prioritySuppliers')}
          </h3>
          <ul className="space-y-3">
            {topSuppliers.map((supplier, index) => (
              <li
                key={supplier.supplierId}
                className="flex items-center justify-between rounded-lg border border-[#e6e6e6] bg-white px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f7faff] text-xs font-semibold text-[#0a61d7]">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-black">{supplier.name}</p>
                    <p className="text-xs text-gray-500">
                      {translateRecordStatus(supplier.status)}
                    </p>
                  </div>
                </div>
                <div className="text-right text-sm">
                  <p className="text-xs text-gray-500">{t('fulfillmentValue')}</p>
                  <p className="font-semibold text-black">
                    {formatCurrency(supplier.value, userCurrency)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

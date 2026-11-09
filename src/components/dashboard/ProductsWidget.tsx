'use client';

import Image from 'next/image';
import { Package } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { formatCurrency } from '@/components/analyticsperformance/FinancialAnalytics';

export type TopProductRow = {
  productId: string;
  rank: number;
  image: string | null;
  productName: string;
  productType: string;
  orderVolume: number;
  unitsSold: number;
  margin: number;
};

type ProductsWidgetProps = {
  products: TopProductRow[];
  maxOrderVolume: number;
  userCurrency: string;
};

export default function ProductsWidget({
  products,
  maxOrderVolume,
  userCurrency,
}: ProductsWidgetProps) {
  const t = useTranslations('dashboard.home.widgets.products');
  const tCommon = useTranslations('dashboard.common');

  if (products.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex h-60 flex-col items-center justify-center rounded-lg">
          <Package className="mb-3 h-10 w-10 text-gray-300" />
          <p className="text-sm font-semibold text-gray-600">{t('emptyTitle')}</p>
          <p className="mt-1 text-xs text-gray-500">{t('emptyHint')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {products.map((product) => {
          const progress =
            maxOrderVolume > 0 ? Math.round((product.orderVolume / maxOrderVolume) * 100) : 0;
          return (
            <li
              key={product.productId}
              className="flex flex-col gap-3 rounded-lg border border-[#e6e6e6] bg-white p-4"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <div className="w-6 shrink-0 text-xs font-semibold text-gray-500">{product.rank}.</div>
                <div className="flex min-w-0 items-center gap-3">
                  {product.image ? (
                    <Image
                      src={product.image}
                      alt={product.productName}
                      width={48}
                      height={48}
                      className="h-12 w-12 shrink-0 rounded-lg border border-[#e6e6e6] object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-[#e6e6e6] bg-[#f7faff]">
                      <Package className="h-5 w-5 text-[#0a61d7]" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-black">{product.productName}</p>
                    <p className="text-xs text-gray-500">{product.productType}</p>
                  </div>
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-4 text-sm @sm:gap-6">
                  <div className="text-right">
                    <p className="text-xs text-gray-500">{t('orderVolume')}</p>
                    <p className="text-sm font-semibold text-black">
                      {formatCurrency(product.orderVolume, userCurrency)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">{tCommon('pieces')}</p>
                    <p className="text-sm font-semibold text-black">
                      {product.unitsSold.toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">{t('margin')}</p>
                    <p
                      className={`text-sm font-semibold ${
                        product.margin >= 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {product.margin.toFixed(1)}%
                    </p>
                  </div>
                </div>
              </div>
              <div className="h-1.5 w-full rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#0a61d7] to-[#5b8df7]"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

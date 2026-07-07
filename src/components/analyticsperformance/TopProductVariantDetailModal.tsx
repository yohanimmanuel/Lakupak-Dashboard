'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { X, Package, TrendingUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatCurrency as utilsFormatCurrency } from '@/utils/currencyUtils';
import { useAnalyticsTranslations } from '@/hooks/useAnalyticsTranslations';

const VARIANTS_PER_PAGE = 8;

export type TopProductSummary = {
  name: string;
  productCategory: string;
  productId: string;
  image?: string | null;
  piecesSold: number;
  orderVolume: number;
  profit: number;
  margin: number;
};

export type TopProductVariantRow = {
  variantKey: string;
  variantName: string;
  piecesSold: number;
  freeItems: number;
  orderVolume: number;
  profit: number;
  margin: number;
};

type TopProductVariantDetailModalProps = {
  isOpen: boolean;
  onClose: () => void;
  product: TopProductSummary | null;
  variants: TopProductVariantRow[];
  userCurrency: string;
};

function ProductImageThumb({
  src,
  alt,
}: {
  src?: string | null;
  alt: string;
}) {
  if (src) {
    return (
      <Image
        src={src}
        alt={alt}
        width={56}
        height={56}
        className="h-14 w-14 shrink-0 rounded-xl border border-[#e6e6e6] object-cover"
      />
    );
  }
  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-[#e6e6e6] bg-[#f7faff]">
      <Package className="h-6 w-6 text-[#0a61d7]" />
    </div>
  );
}

function marginTone(margin: number, baseline: number): string {
  if (margin < 0) return 'text-red-600';
  if (margin > baseline + 0.5) return 'text-emerald-600';
  if (margin < baseline - 0.5) return 'text-amber-600';
  return 'text-gray-900';
}

export default function TopProductVariantDetailModal({
  isOpen,
  onClose,
  product,
  variants,
  userCurrency,
}: TopProductVariantDetailModalProps) {
  const { tTables, tShared } = useAnalyticsTranslations();
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [product?.productId, isOpen]);

  const totalVariants = variants.length;
  const totalPages = Math.max(1, Math.ceil(totalVariants / VARIANTS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const fromVariant = totalVariants === 0 ? 0 : (safePage - 1) * VARIANTS_PER_PAGE + 1;
  const toVariant = Math.min(safePage * VARIANTS_PER_PAGE, totalVariants);
  const pagedVariants = useMemo(
    () => variants.slice((safePage - 1) * VARIANTS_PER_PAGE, safePage * VARIANTS_PER_PAGE),
    [variants, safePage],
  );

  if (!isOpen || !product) return null;

  const baselineMargin = product.margin;
  const totalFreeItems = variants.reduce((sum, variant) => sum + variant.freeItems, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="top-product-variant-modal-title"
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <ProductImageThumb src={product.image} alt={product.name} />
            <div className="min-w-0">
              <h3 id="top-product-variant-modal-title" className="truncate text-lg font-semibold text-gray-900">
                {product.name}
              </h3>
              <p className="mt-0.5 text-sm text-gray-500">{tTables('variantDetailSubtitle')}</p>
              <p className="mt-1 text-xs text-gray-400">{product.productCategory}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label={tTables('close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-4 rounded-xl border border-[#0a61d7]/20 bg-[#f7faff] p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#0a61d7]">
              {tTables('productTotalSummary')}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <div>
                <p className="text-xs text-gray-500">{tTables('piecesSold')}</p>
                <p className="text-sm font-semibold text-gray-900">{product.piecesSold.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">{tTables('freeItems')}</p>
                <p className="text-sm font-semibold text-purple-700">{totalFreeItems.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">{tTables('orderVolume')}</p>
                <p className="text-sm font-semibold text-gray-900">
                  {utilsFormatCurrency(product.orderVolume, userCurrency)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">{tTables('profit')}</p>
                <p className="text-sm font-semibold text-gray-900">
                  {utilsFormatCurrency(product.profit, userCurrency)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">{tTables('margin')}</p>
                <p className="text-sm font-semibold text-gray-900">{product.margin.toFixed(2)}%</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-[#e6e6e6]">
            <div className="border-b border-[#e6e6e6] px-4 py-3">
              <h4 className="text-sm font-semibold text-gray-900">{tTables('variantBreakdown')}</h4>
              <p className="text-xs text-gray-500">{tTables('variantBreakdownHint')}</p>
            </div>

            {variants.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <TrendingUp className="mb-2 h-10 w-10 text-gray-300" />
                <p className="text-sm text-gray-500">{tTables('noVariantData')}</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-xs whitespace-nowrap">
                    <thead className="bg-gray-100 text-gray-500">
                      <tr>
                        <th className="px-4 py-3 font-medium uppercase">{tTables('variantName')}</th>
                        <th className="px-4 py-3 text-center font-medium uppercase">{tTables('piecesSold')}</th>
                        <th className="px-4 py-3 text-center font-medium uppercase">{tTables('freeItems')}</th>
                        <th className="px-4 py-3 text-center font-medium uppercase">{tTables('orderVolume')}</th>
                        <th className="px-4 py-3 text-center font-medium uppercase">{tTables('profit')}</th>
                        <th className="px-4 py-3 text-center font-medium uppercase">{tTables('margin')}</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {pagedVariants.map((variant) => (
                        <tr key={variant.variantKey} className="border-b border-gray-100 last:border-b-0">
                          <td className="max-w-[220px] px-4 py-3 text-black">
                            <span className="block truncate font-medium" title={variant.variantName}>
                              {variant.variantName}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-black">
                            {variant.piecesSold.toLocaleString()}
                          </td>
                          <td
                            className={`px-4 py-3 text-center font-medium ${
                              variant.freeItems > 0 ? 'text-purple-700' : 'text-black'
                            }`}
                          >
                            {variant.freeItems.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-center font-semibold text-black">
                            {utilsFormatCurrency(variant.orderVolume, userCurrency)}
                          </td>
                          <td
                            className={`px-4 py-3 text-center font-medium ${
                              variant.profit < 0 ? 'text-red-600' : 'text-black'
                            }`}
                          >
                            {utilsFormatCurrency(variant.profit, userCurrency)}
                          </td>
                          <td className={`px-4 py-3 text-center font-semibold ${marginTone(variant.margin, baselineMargin)}`}>
                            {variant.margin.toFixed(2)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-col gap-2 border-t border-gray-100 px-4 py-3 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm text-gray-500">
                    {tShared('pagination.showing', { from: fromVariant, to: toVariant, total: totalVariants })}
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="rounded-lg p-2 transition-colors hover:bg-gray-100 disabled:opacity-50"
                      onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                      disabled={safePage === 1}
                      aria-label={tShared('pagination.previousPage')}
                    >
                      <ChevronLeft className="h-4 w-4 text-gray-500" />
                    </button>
                    <button
                      type="button"
                      className="rounded-lg bg-[#0a61d7] px-3 py-2 text-sm font-semibold text-white"
                      aria-label={tShared('pagination.pageAria', { page: safePage })}
                      aria-current="page"
                    >
                      {safePage}
                    </button>
                    <button
                      type="button"
                      className="rounded-lg p-2 transition-colors hover:bg-gray-100 disabled:opacity-50"
                      onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                      disabled={safePage === totalPages}
                      aria-label={tShared('pagination.nextPage')}
                    >
                      <ChevronRight className="h-4 w-4 text-gray-500" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="border-t border-gray-200 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-gray-100 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
          >
            {tTables('close')}
          </button>
        </div>
      </div>
    </div>
  );
}

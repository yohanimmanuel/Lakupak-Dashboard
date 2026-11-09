'use client';

import Link from 'next/link';
import { Layers } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { Product } from '@/types/product';
import { getProductTotalStock } from '@/utils/stockUtils';

function resolveProductStock(product: Product) {
  if (product.variantOptions && product.variantOptions.length > 0) {
    const variantStocks = product.variantOptions.map((variant) => ({
      stockQuantity: Number(variant.stockQuantity ?? 0),
      lowStockThreshold: Number(variant.lowStockThreshold ?? 0),
    }));
    const { totalStock, lowStockThreshold } = getProductTotalStock(variantStocks);
    return {
      totalStock,
      lowStockThreshold: lowStockThreshold || Number(product.lowStockThreshold ?? 0),
    };
  }

  return {
    totalStock: Number(product.stockQuantity ?? 0),
    lowStockThreshold: Number(product.lowStockThreshold ?? 0),
  };
}

type InventoryWidgetProps = {
  products: Product[];
};

export default function InventoryWidget({ products }: InventoryWidgetProps) {
  const t = useTranslations('dashboard.home.widgets.inventory');

  const {
    totalProducts,
    activeProductCount,
    totalPieces,
    averageStock,
    lowStockItems,
    criticalLowStockItems,
    lowStockPreview,
  } = useMemo(() => {
    const total = products.length;
    const active = products.filter((p) => p.status === 'Published').length;
    const productsWithStock = products.map((product) => {
      const { totalStock, lowStockThreshold } = resolveProductStock(product);
      return { product, totalStock, lowStockThreshold };
    });
    const pieces = productsWithStock.reduce((sum, item) => sum + item.totalStock, 0);
    const lowStock = productsWithStock
      .filter(({ totalStock, lowStockThreshold }) => {
        if (lowStockThreshold > 0) {
          return totalStock <= lowStockThreshold;
        }
        return totalStock === 0;
      })
      .sort((a, b) => a.totalStock - b.totalStock);
    const critical = lowStock.filter(({ totalStock, lowStockThreshold }) => {
      if (lowStockThreshold > 0) {
        return totalStock < lowStockThreshold * 0.5;
      }
      return totalStock === 0;
    });

    return {
      totalProducts: total,
      activeProductCount: active,
      totalPieces: pieces,
      averageStock: total > 0 ? pieces / total : 0,
      lowStockItems: lowStock,
      criticalLowStockItems: critical,
      lowStockPreview: lowStock.slice(0, 3),
    };
  }, [products]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2 @lg:grid-cols-3">
        <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
          <p className="text-xs text-gray-500">{t('totalProducts')}</p>
          <p className="mt-1 text-2xl font-semibold text-black">
            {totalProducts.toLocaleString()}
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-wide text-gray-500">
            {t('activePieces', {
              active: activeProductCount.toLocaleString(),
              pieces: totalPieces.toLocaleString(),
            })}
          </p>
        </div>
        <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
          <p className="text-xs text-gray-500">{t('lowStock')}</p>
          <p className="mt-1 text-2xl font-semibold text-black">
            {lowStockItems.length.toLocaleString()}
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-wide text-red-600">
            {t('critical')}: {criticalLowStockItems.length.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
          <p className="text-xs text-gray-500">{t('avgStockLevel')}</p>
          <p className="mt-1 text-2xl font-semibold text-black">
            {Math.round(averageStock).toLocaleString()}
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-wide text-gray-500">
            {t('acrossAllProducts')}
          </p>
        </div>
      </div>
      {lowStockPreview.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center rounded-lg">
          <Layers className="mb-3 h-8 w-8 text-gray-300" />
          <p className="text-sm font-semibold text-gray-500">{t('noLowStockTitle')}</p>
          <p className="mt-1 text-xs text-gray-400">{t('noLowStockHint')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t('topLowStock')}
          </h3>
          <ul className="space-y-2">
            {lowStockPreview.map(({ product: lowStockProduct, totalStock, lowStockThreshold }) => (
              <li
                key={lowStockProduct.productId}
                className="flex flex-col gap-2 rounded-lg border border-[#e6e6e6] bg-white p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-black">{lowStockProduct.name}</span>
                  <Link
                    href={`/products/list/catalog/${lowStockProduct.productId}`}
                    className="text-xs font-semibold text-[#0a61d7] hover:text-[#084ba6]"
                  >
                    {t('viewProduct')}
                  </Link>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                  <span>
                    {t('stock')}:{' '}
                    <span className="font-semibold text-black">{totalStock.toLocaleString()}</span>
                  </span>
                  <span>
                    {t('threshold')}:{' '}
                    <span className="font-semibold text-black">
                      {(lowStockThreshold || 0).toLocaleString()}
                    </span>
                  </span>
                  <span>
                    {t('statusLabel')}:{' '}
                    <span className="font-semibold text-red-600">{t('lowStockLabel')}</span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
          {lowStockItems.length > lowStockPreview.length ? (
            <p className="text-xs text-gray-500">
              {t('moreBelowThreshold', {
                count: lowStockItems.length - lowStockPreview.length,
              })}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

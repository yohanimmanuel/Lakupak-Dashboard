'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Package, X } from 'lucide-react';
import ProductTable from '@/components/productscatalogs/ProductTable';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useAutomationTranslations } from '@/hooks/useAutomationTranslations';
import { useUserStore } from '@/store/userStore';
import type { Product, ProductTableRow, VariantOption } from '@/types/product';
import { formatCurrency, parsePrice } from '@/utils/currencyUtils';
import { formatDate } from '@/utils/dateUtils';

export type PickedProduct = {
  productId: string;
  productLabel: string;
  variantId: string;
  variantLabel: string;
};

const PRODUCTS_QUERY = `
  query GetAutomationProducts($userId: Int!, $page: Int, $limit: Int) {
    products(userId: $userId, page: $page, limit: $limit) {
      nodes {
        id
        productId
        sku
        name
        description
        productType
        brand
        supplier
        status
        productCategory
        catalogName
        images
        halalCertified
        bpomApproved
        originalProduct
        returnPolicyDays
        stockQuantity
        lowStockThreshold
        stockStatus
        variantOptions {
          id
          variantName
          sku
          purchasePrice
          sellingPrice
          originalSellingPrice
          moq
          stockQuantity
          lowStockThreshold
          stockStatus
          isDefault
          isActive
          attributes
        }
        variantDefinitions
        createdAt
        updatedAt
        userId
        hasActiveOffer
        offerBadge
        offerId
        offerName
        discountType
        discountValue
        promotionDetails
        originalPrice
      }
      pagination {
        page
        limit
        totalCount
        totalPages
      }
    }
  }
`;

/** Prefer selectedProducts[]; fall back to legacy single productId fields. */
export function normalizePickedProducts(
  config: Record<string, unknown> | undefined,
): PickedProduct[] {
  const list = config?.selectedProducts;
  if (Array.isArray(list)) {
    return list
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const row = item as Record<string, unknown>;
        const productId = String(row.productId ?? '').trim();
        if (!productId) return null;
        return {
          productId,
          productLabel: String(row.productLabel ?? ''),
          variantId: String(row.variantId ?? ''),
          variantLabel: String(row.variantLabel ?? ''),
        };
      })
      .filter((p): p is PickedProduct => Boolean(p));
  }

  const productId = String(config?.productId ?? '').trim();
  if (!productId) return [];
  return [
    {
      productId,
      productLabel: String(config?.productLabel ?? ''),
      variantId: String(config?.variantId ?? ''),
      variantLabel: String(config?.variantLabel ?? ''),
    },
  ];
}

/** @deprecated Prefer normalizePickedProducts */
export function normalizePickedProduct(
  config: Record<string, unknown> | undefined,
): PickedProduct | null {
  return normalizePickedProducts(config)[0] ?? null;
}

function activeVariants(product: Product | null | undefined): VariantOption[] {
  return (product?.variantOptions ?? []).filter((v) => v.isActive !== false);
}

function variantKey(variant: VariantOption): string {
  return String(variant.id ?? '');
}

function variantLabelOf(variant: VariantOption): string {
  return [variant.variantName, variant.sku].filter(Boolean).join(' · ') || variantKey(variant);
}

function productOnlyPicked(product: Product): PickedProduct {
  return {
    productId: product.productId,
    productLabel: product.name || product.productId,
    variantId: '',
    variantLabel: '',
  };
}

function productWithVariant(product: Product, variant: VariantOption): PickedProduct {
  return {
    productId: product.productId,
    productLabel: product.name || product.productId,
    variantId: variantKey(variant),
    variantLabel: variantLabelOf(variant),
  };
}

export function ProductPickerField({
  label,
  selectedProducts,
  onSelectAction,
  onClearAction,
  /** Low-stock only: pick one or more variants per product. Share-product stays product-level. */
  requireVariant = false,
}: {
  label: string;
  selectedProducts: PickedProduct[];
  onSelectAction: (picked: PickedProduct[]) => void;
  onClearAction: () => void;
  requireVariant?: boolean;
}) {
  const { tBuilder } = useAutomationTranslations();
  const user = useUserStore((s) => s.user);
  const userCurrency = user?.currency || 'IDR';
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingProduct, setPendingProduct] = useState<Product | null>(null);
  const [pendingQueue, setPendingQueue] = useState<Product[]>([]);
  const [pendingResolved, setPendingResolved] = useState<PickedProduct[]>([]);
  const [draftVariantIds, setDraftVariantIds] = useState<string[]>([]);
  const [variantProductsTotal, setVariantProductsTotal] = useState(0);

  const profileToTableRow = useCallback(
    (product: Product): ProductTableRow => {
      const variantOptions = product.variantOptions || [];
      const totalStock = variantOptions.reduce((sum, o) => sum + (o.stockQuantity || 0), 0);
      const totalLow = variantOptions.reduce((sum, o) => sum + (o.lowStockThreshold || 0), 0);
      let sellingPrice = formatCurrency(0, userCurrency);
      if (variantOptions.length > 0) {
        const prices = variantOptions
          .map((option) => parsePrice(String(option.sellingPrice), userCurrency) || 0)
          .filter((price) => price > 0);
        if (prices.length > 0) {
          const minPrice = Math.min(...prices);
          const maxPrice = Math.max(...prices);
          sellingPrice =
            minPrice === maxPrice
              ? formatCurrency(minPrice, userCurrency)
              : `${formatCurrency(minPrice, userCurrency)} – ${formatCurrency(maxPrice, userCurrency)}`;
        }
      }
      const first = variantOptions[0];
      return {
        id: product.id || 0,
        productId: product.productId,
        sku: product.sku,
        name: product.name,
        productType: product.productType,
        brand: product.brand,
        supplier: product.supplier,
        stockQuantity: totalStock,
        lowStockThreshold: totalLow,
        purchasePrice: first?.purchasePrice || '0',
        sellingPrice,
        packageType: 'Piece',
        piecesPerPackage: 1,
        variantOptions,
        status: product.status,
        createdAt: product.createdAt ? formatDate(product.createdAt) : 'N/A',
        lastUpdated: product.updatedAt ? formatDate(product.updatedAt) : 'N/A',
        userId: product.userId || 0,
      };
    },
    [userCurrency],
  );

  const loadProducts = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const pageSize = 100;
      let page = 1;
      let totalPages = 1;
      const all: Product[] = [];
      do {
        const data = await fetchGraphQL<{
          products: { nodes: Product[]; pagination: { totalPages?: number } };
        }>(PRODUCTS_QUERY, { userId: user.id, page, limit: pageSize });
        all.push(...(data.products?.nodes ?? []));
        totalPages = Math.max(1, data.products?.pagination?.totalPages ?? 1);
        page += 1;
      } while (page <= totalPages);
      setProducts(all);
    } catch (e) {
      setError(e instanceof Error ? e.message : tBuilder('productPickerLoadFailed'));
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, tBuilder]);

  useEffect(() => {
    if (!open) return;
    setPendingProduct(null);
    setPendingQueue([]);
    setPendingResolved([]);
    setDraftVariantIds([]);
    setVariantProductsTotal(0);
    void loadProducts();
  }, [open, loadProducts]);

  const pendingVariants = useMemo(() => activeVariants(pendingProduct), [pendingProduct]);

  const startVariantStep = (product: Product, queue: Product[], resolved: PickedProduct[]) => {
    const variants = activeVariants(product);
    const priorIds = selectedProducts
      .filter((p) => p.productId === product.productId && p.variantId.trim())
      .map((p) => p.variantId)
      .filter((id) => variants.some((v) => variantKey(v) === id));
    setPendingResolved(resolved);
    setPendingQueue(queue);
    setPendingProduct(product);
    setDraftVariantIds(
      priorIds.length > 0
        ? priorIds
        : variants.length === 1
          ? [variantKey(variants[0])]
          : [],
    );
  };

  const clearVariantFlow = () => {
    setPendingProduct(null);
    setPendingQueue([]);
    setPendingResolved([]);
    setDraftVariantIds([]);
    setVariantProductsTotal(0);
  };

  const toggleDraftVariant = (id: string) => {
    setDraftVariantIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    );
  };

  const commitPendingVariants = () => {
    if (!pendingProduct || draftVariantIds.length === 0) return;
    const variants = activeVariants(pendingProduct);
    const pickedRows = draftVariantIds
      .map((id) => variants.find((v) => variantKey(v) === id))
      .filter((v): v is VariantOption => Boolean(v))
      .map((v) => productWithVariant(pendingProduct, v));
    const nextResolved = [...pendingResolved, ...pickedRows];
    const [next, ...rest] = pendingQueue;
    if (next) {
      startVariantStep(next, rest, nextResolved);
      return;
    }
    onSelectAction(nextResolved);
    setOpen(false);
    clearVariantFlow();
  };

  const hasSelection = selectedProducts.length > 0;
  const summaryLabel = useMemo(() => {
    if (selectedProducts.length === 0) return '';
    if (selectedProducts.length === 1) {
      return selectedProducts[0].productLabel || selectedProducts[0].productId;
    }
    return tBuilder('productPickerSelectedCount', { count: selectedProducts.length });
  }, [selectedProducts, tBuilder]);

  const summarySub = useMemo(() => {
    if (selectedProducts.length === 0) return '';
    if (!requireVariant) {
      return selectedProducts.length === 1
        ? selectedProducts[0].productId
        : tBuilder('productPickerSelectedHint', { count: selectedProducts.length });
    }
    if (selectedProducts.length === 1) {
      const p = selectedProducts[0];
      return p.variantId
        ? tBuilder('productPickerVariantSummary', { name: p.variantLabel || p.variantId })
        : tBuilder('productPickerPickVariant');
    }
    const withVariant = selectedProducts.filter((p) => p.variantId.trim()).length;
    return tBuilder('productPickerVariantsReady', {
      count: withVariant,
      total: selectedProducts.length,
    });
  }, [selectedProducts, tBuilder, requireVariant]);

  const handleConfirmProducts = (picked: Product[]) => {
    if (picked.length === 0) return;

    if (!requireVariant) {
      onSelectAction(picked.map(productOnlyPicked));
      setOpen(false);
      clearVariantFlow();
      return;
    }

    const resolved: PickedProduct[] = [];
    const needsVariant: Product[] = [];

    for (const product of picked) {
      const variants = activeVariants(product);
      if (variants.length === 0) {
        resolved.push(productOnlyPicked(product));
        continue;
      }
      if (variants.length === 1) {
        resolved.push(productWithVariant(product, variants[0]));
        continue;
      }
      needsVariant.push(product);
    }

    if (needsVariant.length === 0) {
      onSelectAction(resolved);
      setOpen(false);
      clearVariantFlow();
      return;
    }

    const [first, ...rest] = needsVariant;
    setVariantProductsTotal(needsVariant.length);
    startVariantStep(first, rest, resolved);
  };

  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      {hasSelection ? (
        <div className="space-y-2 rounded-lg border border-[#e6e6e6] bg-white px-3 py-2.5">
          <div className="flex items-start gap-2">
            <Package className="mt-0.5 h-4 w-4 shrink-0 text-[#0a61d7]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-black">{summaryLabel}</p>
              <p className="mt-0.5 truncate text-[11px] text-gray-500">{summarySub}</p>
            </div>
            <div className="flex shrink-0 flex-col gap-1">
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="rounded-md px-2 py-1 text-[11px] font-medium text-[#0a61d7] hover:bg-[#f7faff]"
              >
                {tBuilder('productPickerChange')}
              </button>
              <button
                type="button"
                onClick={onClearAction}
                className="rounded-md px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50"
              >
                {tBuilder('productPickerClear')}
              </button>
            </div>
          </div>
          {selectedProducts.length > 1 && (
            <ul className="space-y-1 border-t border-gray-100 pt-2">
              {selectedProducts.slice(0, 5).map((product) => (
                <li key={`${product.productId}-${product.variantId}`} className="truncate text-[11px] text-gray-600">
                  <span className="font-medium text-black">
                    {product.productLabel || product.productId}
                  </span>
                  {product.variantLabel ? ` · ${product.variantLabel}` : ''}
                </li>
              ))}
              {selectedProducts.length > 5 && (
                <li className="text-[11px] font-medium text-gray-400">
                  {tBuilder('productPickerAndMore')}
                </li>
              )}
            </ul>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#e6e6e6] bg-white px-3 py-2.5 text-xs font-semibold text-black hover:bg-gray-50"
        >
          <Package className="h-4 w-4 text-[#0a61d7]" />
          {tBuilder('productPickerOpen')}
        </button>
      )}

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-3 sm:p-6"
            onClick={() => setOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={tBuilder('productPickerTitle')}
              className="flex max-h-[min(90dvh,52rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-[#e6e6e6] bg-white shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-4 py-3">
                <div>
                  <h3 className="text-sm font-semibold text-black">
                    {pendingProduct
                      ? tBuilder('productPickerVariantLabel')
                      : tBuilder('productPickerTitle')}
                  </h3>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {pendingProduct
                      ? tBuilder('productPickerVariantHintMulti')
                      : tBuilder('productPickerHintMulti')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="-mr-1 rounded-lg p-1 text-gray-500 hover:bg-gray-50 hover:text-black"
                  aria-label={tBuilder('productPickerClose')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
                {loading ? (
                  <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {tBuilder('productPickerLoading')}
                  </div>
                ) : error ? (
                  <div className="space-y-2">
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {error}
                    </div>
                    <button
                      type="button"
                      onClick={() => void loadProducts()}
                      className="text-xs font-medium text-[#0a61d7] hover:underline"
                    >
                      {tBuilder('productPickerRetry')}
                    </button>
                  </div>
                ) : pendingProduct ? (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-black">
                      {pendingProduct.name || pendingProduct.productId}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      {tBuilder('productPickerVariantStep', {
                        current: draftVariantIds.length,
                        total: pendingVariants.length,
                      })}
                      {variantProductsTotal > 1
                        ? ` · ${tBuilder('productPickerVariantProductStep', {
                            current: variantProductsTotal - pendingQueue.length,
                            total: variantProductsTotal,
                          })}`
                        : ''}
                    </p>
                    <ul className="divide-y divide-gray-100 rounded-lg border border-[#e6e6e6]">
                      {pendingVariants.map((variant) => {
                        const id = variantKey(variant);
                        const selected = draftVariantIds.includes(id);
                        return (
                          <li key={id}>
                            <button
                              type="button"
                              onClick={() => toggleDraftVariant(id)}
                              className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs ${
                                selected
                                  ? 'bg-[#f7faff] font-semibold text-[#0a61d7]'
                                  : 'text-gray-700 hover:bg-gray-50'
                              }`}
                            >
                              <span
                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                  selected
                                    ? 'border-[#0a61d7] bg-[#0a61d7] text-white'
                                    : 'border-gray-300 bg-white'
                                }`}
                              >
                                {selected ? '✓' : ''}
                              </span>
                              {variantLabelOf(variant)}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={clearVariantFlow}
                        className="rounded-lg border border-[#e6e6e6] px-3 py-2 text-xs font-medium text-black hover:bg-gray-50"
                      >
                        {tBuilder('productPickerClose')}
                      </button>
                      <button
                        type="button"
                        disabled={draftVariantIds.length === 0}
                        onClick={commitPendingVariants}
                        className="rounded-lg bg-[#0a61d7] px-3 py-2 text-xs font-semibold text-white hover:bg-[#084ba6] disabled:opacity-50"
                      >
                        {tBuilder('productPickerConfirm')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <ProductTable
                    products={products}
                    setProductsAction={setProducts}
                    profileToTableRowAction={profileToTableRow}
                    onRefreshProductsAction={async () => {
                      await loadProducts();
                    }}
                    pickerMode
                    pickerSingleSelect={false}
                    pickerConfirmLabel={tBuilder('productPickerConfirm')}
                    initialSelectedProductIds={selectedProducts.map((p) => p.productId)}
                    onConfirmPickerSelection={handleConfirmProducts}
                  />
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

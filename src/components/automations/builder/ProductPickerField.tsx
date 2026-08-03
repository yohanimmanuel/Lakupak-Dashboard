'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Package } from 'lucide-react';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useAutomationTranslations } from '@/hooks/useAutomationTranslations';
import { useUserStore } from '@/store/userStore';
import { BuilderSelect } from './BuilderSelect';

type ProductVariantOption = {
  id: number | string;
  variantName?: string | null;
  sku?: string | null;
  isActive?: boolean | null;
};

type ProductNode = {
  id: number | string;
  productId?: string | null;
  name?: string | null;
  sku?: string | null;
  variantOptions?: ProductVariantOption[] | null;
};

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
        name
        sku
        variantOptions {
          id
          variantName
          sku
          isActive
        }
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

export function normalizePickedProduct(config: Record<string, unknown> | undefined): PickedProduct | null {
  const productId = String(config?.productId ?? '').trim();
  if (!productId) return null;
  return {
    productId,
    productLabel: String(config?.productLabel ?? ''),
    variantId: String(config?.variantId ?? ''),
    variantLabel: String(config?.variantLabel ?? ''),
  };
}

function productKey(product: ProductNode): string {
  return String(product.productId || product.id);
}

function variantKey(variant: ProductVariantOption): string {
  return String(variant.id);
}

export function ProductPickerField({
  label,
  value,
  onSelectAction,
  onClearAction,
}: {
  label: string;
  value: PickedProduct | null;
  onSelectAction: (picked: PickedProduct) => void;
  onClearAction: () => void;
}) {
  const { tBuilder } = useAutomationTranslations();
  const user = useUserStore((s) => s.user);
  const userId = user?.id ?? null;
  const [products, setProducts] = useState<ProductNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestVersionRef = useRef(0);

  const loadProducts = useCallback(async () => {
    const requestVersion = ++requestVersionRef.current;
    const isCurrent = () => requestVersionRef.current === requestVersion;

    if (userId == null) {
      setProducts([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const pageSize = 100;
      let page = 1;
      let totalPages = 1;
      const all: ProductNode[] = [];

      do {
        if (!isCurrent()) return;
        const data = await fetchGraphQL<{
          products: {
            nodes: ProductNode[];
            pagination: { totalPages?: number };
          };
        }>(PRODUCTS_QUERY, { userId, page, limit: pageSize });
        if (!isCurrent()) return;
        all.push(...(data.products?.nodes ?? []));
        totalPages = Math.max(1, data.products?.pagination?.totalPages ?? 1);
        page += 1;
      } while (page <= totalPages);

      if (!isCurrent()) return;
      setProducts(all);
    } catch (e) {
      if (!isCurrent()) return;
      setError(e instanceof Error ? e.message : tBuilder('productPickerLoadFailed'));
      setProducts([]);
    } finally {
      if (!isCurrent()) return;
      setLoading(false);
    }
  }, [userId, tBuilder]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const selectedProduct = useMemo(() => {
    if (!value?.productId) return null;
    return products.find((p) => productKey(p) === value.productId) ?? null;
  }, [products, value?.productId]);

  const productOptions = useMemo(() => {
    const mapped = products.map((product) => ({
      value: productKey(product),
      label: [product.name, product.sku].filter(Boolean).join(' · ') || productKey(product),
    }));
    if (value?.productId && !mapped.some((o) => o.value === value.productId)) {
      mapped.unshift({
        value: value.productId,
        label: value.productLabel || value.productId,
      });
    }
    return mapped;
  }, [products, value]);

  const variantOptions = useMemo(() => {
    const variants = (selectedProduct?.variantOptions ?? []).filter(
      (v) => v.isActive !== false,
    );
    const mapped = variants.map((variant) => ({
      value: variantKey(variant),
      label:
        [variant.variantName, variant.sku].filter(Boolean).join(' · ') || variantKey(variant),
    }));
    if (
      value?.variantId &&
      selectedProduct &&
      productKey(selectedProduct) === value.productId &&
      !mapped.some((o) => o.value === value.variantId)
    ) {
      mapped.unshift({
        value: value.variantId,
        label: value.variantLabel || value.variantId,
      });
    }
    return mapped;
  }, [selectedProduct, value]);

  return (
    <div className="space-y-2">
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      {loading ? (
        <div className="flex items-center gap-2 rounded-lg border border-[#e6e6e6] bg-white px-3 py-2.5 text-xs text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {tBuilder('productPickerLoading')}
        </div>
      ) : error ? (
        <div className="space-y-2">
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
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
      ) : products.length === 0 && !value ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2.5 text-xs text-gray-500">
          {tBuilder('productPickerEmpty')}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 shrink-0 text-[#0a61d7]" />
            <div className="min-w-0 flex-1">
              <BuilderSelect
                aria-label={label}
                value={value?.productId ?? ''}
                options={[
                  { value: '', label: tBuilder('productPickerProductPlaceholder') },
                  ...productOptions,
                ]}
                onChangeAction={(next) => {
                  if (!next) {
                    onClearAction();
                    return;
                  }
                  const product = products.find((p) => productKey(p) === next);
                  const labelText =
                    productOptions.find((o) => o.value === next)?.label || next;
                  const variants = (product?.variantOptions ?? []).filter(
                    (v) => v.isActive !== false,
                  );
                  const first = variants[0];
                  onSelectAction({
                    productId: next,
                    productLabel: labelText,
                    variantId: first ? variantKey(first) : '',
                    variantLabel: first
                      ? [first.variantName, first.sku].filter(Boolean).join(' · ') ||
                        variantKey(first)
                      : '',
                  });
                }}
              />
            </div>
          </div>
          {value?.productId ? (
            <div>
              <span className="mb-1 block text-xs font-medium text-gray-600">
                {tBuilder('productPickerVariantLabel')}
              </span>
              {variantOptions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {tBuilder('productPickerNoVariants')}
                </div>
              ) : (
                <BuilderSelect
                  aria-label={tBuilder('productPickerVariantLabel')}
                  value={value.variantId}
                  options={[
                    { value: '', label: tBuilder('productPickerVariantPlaceholder') },
                    ...variantOptions,
                  ]}
                  onChangeAction={(next) => {
                    if (!next) {
                      onSelectAction({
                        ...value,
                        variantId: '',
                        variantLabel: '',
                      });
                      return;
                    }
                    const labelText =
                      variantOptions.find((o) => o.value === next)?.label || next;
                    onSelectAction({
                      ...value,
                      variantId: next,
                      variantLabel: labelText,
                    });
                  }}
                />
              )}
            </div>
          ) : null}
          {value?.productId ? (
            <div className="rounded-lg border border-[#e6e6e6] bg-[#f7faff] px-3 py-2 text-[11px] text-gray-600">
              <p className="font-medium text-black">
                {value.productLabel || value.productId}
              </p>
              {value.variantId ? (
                <p className="mt-0.5">
                  {tBuilder('productPickerVariantSummary', {
                    name: value.variantLabel || value.variantId,
                  })}
                </p>
              ) : (
                <p className="mt-0.5 text-amber-700">{tBuilder('productPickerPickVariant')}</p>
              )}
              <button
                type="button"
                onClick={onClearAction}
                className="mt-1.5 text-[11px] font-medium text-red-600 hover:underline"
              >
                {tBuilder('productPickerClear')}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

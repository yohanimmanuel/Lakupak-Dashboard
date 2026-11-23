'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Search, Check, Grid, List, Package, X, ChevronDown } from 'lucide-react';
import type {
  OfferWizardFormData,
  ProductSelection,
} from './OfferDiscountTypeTab';
import { useOffersTranslations } from '@/hooks/useOffersTranslations';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';
import { useUserStore } from '@/store/userStore';
import OfferPickerPagination, {
  usePagedSlice,
} from './OfferPickerPagination';

export type ProductOption = {
  productId: string;
  name: string;
  brand?: string | null;
  images: string[];
  stockLevels?: Array<{ name: string; piecesPerUnit: number }>;
  variantOptions: Array<{
    id: number;
    variantName: string;
    sellingPrice: number;
  }>;
};

type Props = {
  formData: OfferWizardFormData;
  onFormChangeAction: (updates: Partial<OfferWizardFormData>) => void;
  products: ProductOption[];
};

function priceRangeLabel(product: ProductOption, currency: string): string {
  const prices = (product.variantOptions || [])
    .map((v) => Number(v.sellingPrice))
    .filter((n) => Number.isFinite(n) && n >= 0);
  if (prices.length === 0) return '—';
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min === max) return formatCurrency(min, currency);
  return `${formatCurrency(min, currency)} – ${formatCurrency(max, currency)}`;
}

function GreenCheckbox({
  checked,
  disabled,
}: {
  checked: boolean;
  disabled?: boolean;
}) {
  return (
    <span
      className={`w-4 h-4 shrink-0 border-2 rounded transition-all flex items-center justify-center ${
        disabled ? 'opacity-50' : ''
      } ${
        checked ? 'bg-green-500 border-green-500' : 'bg-white border-gray-300'
      }`}
    >
      {checked && <Check className="w-3 h-3 text-white" />}
    </span>
  );
}

function ProductImageThumb({
  images,
  name,
  size = 'lg',
}: {
  images: string[];
  name: string;
  size?: 'lg' | 'sm';
}) {
  const src = images?.[0];
  const box =
    size === 'lg'
      ? 'w-full h-32 bg-gray-100 rounded-lg mb-3'
      : 'w-10 h-10 bg-gray-100 rounded shrink-0';
  if (src) {
    return (
      <div className={`${box} flex items-center justify-center overflow-hidden relative`}>
        <img
          src={src}
          alt={name}
          className="w-full h-full object-cover"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            const placeholder = target.nextElementSibling as HTMLElement | null;
            if (placeholder) placeholder.style.display = 'flex';
          }}
        />
        <div
          className="absolute inset-0 items-center justify-center text-gray-400"
          style={{ display: 'none' }}
        >
          <Package className={size === 'lg' ? 'w-10 h-10' : 'w-5 h-5'} />
        </div>
      </div>
    );
  }
  return (
    <div className={`${box} flex items-center justify-center`}>
      <Package className={size === 'lg' ? 'w-10 h-10 text-gray-300' : 'w-5 h-5 text-gray-300'} />
    </div>
  );
}

function selectionSummaryLabel(
  sel: ProductSelection,
  tCreatePage: (key: string, values?: Record<string, string>) => string,
): string {
  if (sel.variantScope === 'entire') {
    return tCreatePage('allVariantsSelected');
  }
  return tCreatePage('variantsSelected', {
    count: String(sel.variantOptionIds.length),
  });
}

export default function OfferProductTab({
  formData,
  onFormChangeAction,
  products,
}: Props) {
  const { tCreatePage, tTable } = useOffersTranslations();
  const user = useUserStore((s) => s.user);
  const currency = user?.currency || getDefaultCurrency();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [modalProduct, setModalProduct] = useState<ProductOption | null>(null);
  const [draftScope, setDraftScope] = useState<'entire' | 'specific'>('entire');
  const [draftVariantIds, setDraftVariantIds] = useState<number[]>([]);
  const [draftLevelSelections, setDraftLevelSelections] = useState<Record<string, string[]>>({});
  const [expandedVariantId, setExpandedVariantId] = useState<number | null>(null);

  const selections = formData.productSelections;
  const selectedIds = useMemo(
    () => new Set(selections.map((s) => s.productId)),
    [selections],
  );

  const selectedProducts = useMemo(
    () =>
      selections
        .map((sel) => {
          const product = products.find((p) => p.productId === sel.productId);
          return product ? { product, sel } : null;
        })
        .filter(Boolean) as Array<{ product: ProductOption; sel: ProductSelection }>,
    [selections, products],
  );

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.productId.toLowerCase().includes(q) ||
        (p.brand || '').toLowerCase().includes(q),
    );
  }, [products, search]);

  useEffect(() => {
    setPage(1);
  }, [search, viewMode]);

  const { paged, total, totalPages, safePage, fromRow, toRow } = usePagedSlice(
    filteredProducts,
    page,
  );

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const openModal = (product: ProductOption) => {
    const existing = selections.find((s) => s.productId === product.productId);
    setModalProduct(product);
    const names = (product.stockLevels ?? []).map((level) => level.name);
    setDraftLevelSelections(Object.fromEntries(product.variantOptions.map(v => [String(v.id), existing?.stockLevelsByVariant?.[String(v.id)] ?? names])));
    setExpandedVariantId(null);
    if (existing) {
      setDraftScope(existing.variantScope);
      if (existing.variantScope === 'entire') {
        setDraftVariantIds(product.variantOptions.map((v) => v.id));
      } else {
        setDraftVariantIds([...existing.variantOptionIds]);
      }
    } else {
      setDraftScope('entire');
      setDraftVariantIds(product.variantOptions.map((v) => v.id));
    }
  };

  const selectEntire = () => {
    if (!modalProduct) return;
    setDraftScope('entire');
    setDraftVariantIds(modalProduct.variantOptions.map((v) => v.id));
  };

  const selectSpecific = () => {
    setDraftScope('specific');
    if (draftScope === 'entire') {
      setDraftVariantIds([]);
    }
  };

  const toggleVariant = (id: number) => {
    if (draftScope === 'entire') return;
    setDraftVariantIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const validLevelSelection = !modalProduct || modalProduct.variantOptions.every(v => (draftScope === 'entire' || draftVariantIds.includes(v.id)) ? (draftLevelSelections[String(v.id)]?.length ?? 0) > 0 : true);
  const confirmModal = () => {
    if (!modalProduct) return;
    if ((draftScope === 'specific' && draftVariantIds.length === 0) || !validLevelSelection) return;
    const nextSel: ProductSelection = {
      productId: modalProduct.productId,
      variantScope: draftScope,
      variantOptionIds: draftScope === 'entire' ? [] : [...draftVariantIds],
      stockLevelsByVariant: Object.fromEntries((draftScope === 'entire' ? modalProduct.variantOptions.map(v => v.id) : draftVariantIds).map(id => [String(id), draftLevelSelections[String(id)] ?? []])),
    };
    const idx = selections.findIndex((s) => s.productId === modalProduct.productId);
    const next =
      idx >= 0
        ? selections.map((s, i) => (i === idx ? nextSel : s))
        : [...selections, nextSel];
    onFormChangeAction({ productSelections: next });
    setModalProduct(null);
  };

  const removeSelection = (productId: string) => {
    onFormChangeAction({
      productSelections: selections.filter((s) => s.productId !== productId),
    });
  };

  const canConfirm =
    (draftScope === 'entire' || draftVariantIds.length > 0) && validLevelSelection;
  const isEditingExisting =
    modalProduct != null && selectedIds.has(modalProduct.productId);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">
          {tCreatePage('productTabTitle')}
        </h3>
        <p className="text-sm text-gray-500">{tCreatePage('productTabSubtitle')}</p>
      </div>

      {selectedProducts.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-600">
            {tCreatePage('productsSelected', {
              count: String(selectedProducts.length),
            })}
          </p>
          <div className="space-y-2">
            {selectedProducts.map(({ product, sel }) => (
              <div
                key={product.productId}
                className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start justify-between gap-3"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <ProductImageThumb
                    images={product.images || []}
                    name={product.name}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-blue-800 truncate">
                      {product.name}
                    </p>
                    <p className="text-xs text-blue-600 mt-0.5">
                      {selectionSummaryLabel(sel, tCreatePage)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => openModal(product)}
                    className="text-xs font-medium text-[#0a61d7] hover:underline"
                  >
                    {tCreatePage('changeScope')}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSelection(product.productId)}
                    className="p-1 text-blue-400 hover:text-red-500 hover:bg-white/60 rounded"
                    aria-label={tTable('remove') || 'Remove'}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tCreatePage('searchProducts')}
            className="w-full pl-10 pr-4 py-2 text-xs text-black border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] bg-white"
          />
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 self-end sm:self-auto">
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded transition-colors ${
              viewMode === 'grid'
                ? 'bg-white text-[#0a61d7] shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            aria-label={tCreatePage('gridView')}
          >
            <Grid className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`p-2 rounded transition-colors ${
              viewMode === 'list'
                ? 'bg-white text-[#0a61d7] shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            aria-label={tCreatePage('listView')}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {filteredProducts.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-sm text-gray-500">{tCreatePage('noProducts')}</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {paged.map((product) => {
            const selected = selectedIds.has(product.productId);
            return (
              <button
                key={product.productId}
                type="button"
                onClick={() => openModal(product)}
                className={`bg-white rounded-lg border overflow-hidden text-left transition-shadow hover:shadow-md ${
                  selected
                    ? 'ring-2 ring-[#0a61d7] border-[#0a61d7]'
                    : 'border-gray-200'
                }`}
              >
                <div className="p-4">
                  <ProductImageThumb
                    images={product.images || []}
                    name={product.name}
                  />
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-medium text-black text-sm line-clamp-2">
                        {product.name}
                      </h4>
                      {selected && (
                        <span className="w-4 h-4 shrink-0 rounded bg-green-500 border-2 border-green-500 flex items-center justify-center">
                          <Check className="w-3 h-3 text-white" />
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      {product.brand || tCreatePage('noBrand')}
                    </p>
                    <p className="text-xs font-medium text-black">
                      {priceRangeLabel(product, currency)}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#e6e6e6]">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-100 text-gray-500 whitespace-nowrap">
              <tr>
                <th className="py-3 px-4 font-medium uppercase text-left">
                  {tCreatePage('product')}
                </th>
                <th className="py-3 px-4 font-medium uppercase text-left">
                  {tCreatePage('brand')}
                </th>
                <th className="py-3 px-4 font-medium uppercase text-left">
                  {tCreatePage('priceRange')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {paged.map((product) => {
                const selected = selectedIds.has(product.productId);
                return (
                  <tr
                    key={product.productId}
                    onClick={() => openModal(product)}
                    className={`border-b cursor-pointer transition ${
                      selected ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <ProductImageThumb
                          images={product.images || []}
                          name={product.name}
                          size="sm"
                        />
                        <span className="font-medium text-black">{product.name}</span>
                        {selected && (
                          <span className="w-4 h-4 shrink-0 rounded bg-green-500 border-2 border-green-500 flex items-center justify-center">
                            <Check className="w-3 h-3 text-white" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-700">
                      {product.brand || '—'}
                    </td>
                    <td className="py-3 px-4 text-black">
                      {priceRangeLabel(product, currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <OfferPickerPagination
        page={safePage}
        totalPages={totalPages}
        total={total}
        showingLabel={tTable('pagination.showing', {
          from: String(fromRow),
          to: String(toRow),
          total: String(total),
        })}
        onPageChange={setPage}
      />

      {modalProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg border border-[#e6e6e6] w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-[#e6e6e6]">
              <div>
                <h3 className="text-lg font-semibold text-black">
                  {tCreatePage('variantModalTitle')}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">{modalProduct.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setModalProduct(null)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-3 overflow-y-auto flex-1">
              <button
                type="button"
                onClick={selectEntire}
                className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                  draftScope === 'entire'
                    ? 'border-[#0a61d7] bg-[#f0f6ff]'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <GreenCheckbox checked={draftScope === 'entire'} />
                  <div>
                    <div className="text-sm font-medium text-black">
                      {tCreatePage('entireProduct')}
                    </div>
                    <div className="text-xs text-gray-500">
                      {tCreatePage('entireProductHint')}
                    </div>
                  </div>
                </div>
              </button>

              <div className="pt-1">
                <button type="button" onClick={selectSpecific} className="w-full text-left mb-2">
                  <p className="text-xs font-medium text-gray-700 flex items-center gap-2">
                    <GreenCheckbox checked={draftScope === 'specific'} />
                    {tCreatePage('specificVariants') || tCreatePage('specificVariant')}
                  </p>
                  <p className="text-xs text-gray-500 mt-1 ml-6">
                    {tCreatePage('specificVariantsHint') ||
                      tCreatePage('specificVariantHint')}
                  </p>
                </button>
                {modalProduct.variantOptions.length === 0 ? (
                  <p className="text-xs text-gray-500">{tCreatePage('noVariants')}</p>
                ) : (
                  <div className="space-y-2">
                    {modalProduct.variantOptions.map((v) => {
                      const checked = draftScope === 'entire' || draftVariantIds.includes(v.id);
                      const selectedLevels = draftLevelSelections[String(v.id)] ?? [];
                      const expanded = expandedVariantId === v.id;
                      return (
                        <div key={v.id} className={`rounded-lg border-2 transition-all ${checked ? 'border-[#0a61d7] bg-[#f0f6ff]' : 'border-gray-200'}`}>
                          <div className="flex items-center gap-2 p-3">
                            <button
                              type="button"
                              disabled={draftScope === 'entire'}
                              onClick={() => toggleVariant(v.id)}
                              className="flex flex-1 min-w-0 items-center gap-3 text-left disabled:cursor-default"
                            >
                              <GreenCheckbox checked={checked} disabled={draftScope === 'entire'} />
                              <span className="text-sm text-black truncate">{v.variantName}</span>
                            </button>
                            <span className="text-xs font-medium text-gray-700 shrink-0">
                              {formatCurrency(Number(v.sellingPrice) || 0, currency)}
                            </span>
                            <button
                              type="button"
                              aria-label={`Tipe stok: ${v.variantName}`}
                              aria-expanded={expanded}
                              onClick={() => setExpandedVariantId(expanded ? null : v.id)}
                              disabled={!checked}
                              className="ml-1 rounded p-1 text-gray-600 hover:bg-blue-100 disabled:opacity-40"
                            >
                              <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                            </button>
                          </div>
                          {checked && expanded && (
                            <div className="border-t border-blue-200 px-3 py-3">
                              <p className="mb-2 text-xs font-medium text-gray-700">Tipe stok yang memenuhi syarat</p>
                              <div className="flex flex-wrap gap-2">
                                {(modalProduct.stockLevels ?? []).map(level => {
                                  const active = selectedLevels.includes(level.name);
                                  return (
                                    <button
                                      key={level.name}
                                      type="button"
                                      aria-pressed={active}
                                      onClick={() => setDraftLevelSelections(prev => ({
                                        ...prev,
                                        [String(v.id)]: active
                                          ? (prev[String(v.id)] ?? []).filter(name => name !== level.name)
                                          : [...(prev[String(v.id)] ?? []), level.name],
                                      }))}
                                      className={`rounded-md border px-3 py-1.5 text-xs ${active ? 'border-[#0a61d7] bg-[#e1efff] text-[#0a61d7]' : 'border-gray-300 bg-white text-gray-700'}`}
                                    >
                                      {level.name}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          {checked && selectedLevels.length === 0 && (
                            <p className="px-3 pb-2 text-xs text-red-600">Pilih minimal satu tipe stok.</p>
                          )}
                        </div>
                      );
                    })}
                              </div>
                            )}
                            {(draftLevelSelections[String(v.id)]?.length ?? 0) === 0 && <p className="mt-2 text-xs text-red-600">Pilih minimal satu tipe stok.</p>}
                          </div>
                        )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-[#e6e6e6] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalProduct(null)}
                className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 text-sm hover:bg-gray-300"
              >
                {tCreatePage('cancel') || 'Cancel'}
              </button>
              <button
                type="button"
                onClick={confirmModal}
                disabled={!canConfirm}
                className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                  !canConfirm
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-[#0a61d7] text-white hover:bg-[#084ba6]'
                }`}
              >
                {isEditingExisting
                  ? tCreatePage('updateProductSelection')
                  : tCreatePage('addProductSelection')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

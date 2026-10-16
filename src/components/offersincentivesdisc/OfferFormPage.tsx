'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Tag,
  Calendar,
  Package,
  User,
  CheckCircle,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useUserStore } from '@/store/userStore';
import { useOffersTranslations } from '@/hooks/useOffersTranslations';
import type { Offer, OfferStatus } from '@/types/offer';
import OfferDiscountTypeTab, {
  type OfferWizardFormData,
} from './OfferDiscountTypeTab';
import OfferTimingTab from './OfferTimingTab';
import OfferProductTab, { type ProductOption } from './OfferProductTab';
import OfferClientTab, { type BuyerOption } from './OfferClientTab';
import { SkeletonWizardPage } from '@/components/skeleton/SkeletonWizardPage';

type TabId = 'discount' | 'timing' | 'product' | 'client';

const TAB_IDS: TabId[] = ['discount', 'timing', 'product', 'client'];

const TAB_ICONS: Record<TabId, React.ReactNode> = {
  discount: <Tag className="w-5 h-5" />,
  timing: <Calendar className="w-5 h-5" />,
  product: <Package className="w-5 h-5" />,
  client: <User className="w-5 h-5" />,
};

const BUYERS_QUERY = `
  query OfferFormBuyers($userId: Int!, $page: Int, $limit: Int) {
    buyers(userId: $userId, page: $page, limit: $limit) {
      nodes { buyerId storeName owner }
      pagination { totalPages }
    }
  }
`;

const PRODUCTS_QUERY = `
  query OfferFormProducts($userId: Int!, $page: Int, $limit: Int) {
    products(userId: $userId, page: $page, limit: $limit) {
      nodes {
        productId
        name
        brand
        images
        variantOptions { id variantName sellingPrice }
      }
      pagination { totalPages }
    }
  }
`;

const SAVE_OFFER_GROUP_MUTATION = `
  mutation SaveOfferGroup(
    $userId: Int!
    $seedId: String
    $groupId: String
    $buyerId: String
    $discountType: String!
    $discountValue: Float!
    $buyQuantity: Int
    $freeQuantity: Int
    $promotionApplyMode: String
    $startDate: String!
    $endDate: String
    $status: String
    $notes: String
    $description: String
    $targets: [OfferGroupTargetInput!]!
  ) {
    saveOfferGroup(
      userId: $userId
      seedId: $seedId
      groupId: $groupId
      buyerId: $buyerId
      discountType: $discountType
      discountValue: $discountValue
      buyQuantity: $buyQuantity
      freeQuantity: $freeQuantity
      promotionApplyMode: $promotionApplyMode
      startDate: $startDate
      endDate: $endDate
      status: $status
      notes: $notes
      description: $description
      targets: $targets
    ) {
      groupId
      offers { id groupId }
    }
  }
`;

function toDateInput(iso?: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

function emptyForm(prefillBuyerId?: string | null): OfferWizardFormData {
  const today = new Date().toISOString().slice(0, 10);
  return {
    buyerId: prefillBuyerId || '',
    productSelections: [],
    enablePriceDiscount: true,
    enableBuyXGetY: false,
    priceDiscountMode: 'percentage',
    discountValue: '',
    buyQuantity: '',
    freeQuantity: '',
    promotionApplyMode: 'after_moq',
    startDate: today,
    endDate: '',
    unlimitedEnd: true,
    status: 'draft',
    notes: '',
  };
}

/** Same predicates as each wizard tab — derived from formData so edit prefills / defaults count. */
function isDiscountTabComplete(formData: OfferWizardFormData): boolean {
  const statusOk = Boolean(formData.status);
  const atLeastOne = formData.enablePriceDiscount || formData.enableBuyXGetY;
  if (!statusOk || !atLeastOne) return false;

  let priceOk = true;
  if (formData.enablePriceDiscount) {
    const value = Number.parseFloat(formData.discountValue);
    priceOk =
      Number.isFinite(value) &&
      value > 0 &&
      (formData.priceDiscountMode !== 'percentage' || value <= 100);
  }

  let bxgyOk = true;
  if (formData.enableBuyXGetY) {
    const buy = Number.parseInt(formData.buyQuantity, 10);
    const free = Number.parseInt(formData.freeQuantity, 10);
    bxgyOk = buy > 0 && free > 0;
  }

  return priceOk && bxgyOk;
}

function isTimingTabComplete(formData: OfferWizardFormData): boolean {
  if (!formData.startDate) return false;
  if (formData.unlimitedEnd) return true;
  if (!formData.endDate) return false;
  return formData.endDate >= formData.startDate;
}

function isProductTabComplete(formData: OfferWizardFormData): boolean {
  const selections = formData.productSelections;
  if (selections.length === 0) return false;
  return selections.every((s) =>
    s.variantScope === 'entire' ? true : s.variantOptionIds.length > 0,
  );
}

function isClientTabComplete(formData: OfferWizardFormData): boolean {
  return Boolean(formData.buyerId);
}

/** Merge one or more offer rows (same group) into wizard form state. */
function offersToForm(offers: Offer[]): OfferWizardFormData {
  const offer = offers[0];
  if (!offer) return emptyForm();

  const isBxgy = offer.discountType === 'buy_x_get_y';
  const isPrice =
    offer.discountType === 'percentage' || offer.discountType === 'fixed_amount';
  const freeFromOffer =
    offer.freeQuantity != null
      ? String(offer.freeQuantity)
      : isBxgy
        ? String(Math.round(offer.discountValue ?? 0) || '')
        : '';
  const hasCombo =
    isPrice &&
    offer.buyQuantity != null &&
    offer.buyQuantity > 0 &&
    ((offer.freeQuantity != null && offer.freeQuantity > 0) || false);

  const byProduct = new Map<
    string,
    { entire: boolean; variantIds: number[] }
  >();
  for (const row of offers) {
    if (!row.productId) continue;
    const cur = byProduct.get(row.productId) || {
      entire: false,
      variantIds: [],
    };
    if (row.variantOptionId == null) {
      cur.entire = true;
    } else if (!cur.variantIds.includes(row.variantOptionId)) {
      cur.variantIds.push(row.variantOptionId);
    }
    byProduct.set(row.productId, cur);
  }

  const productSelections = Array.from(byProduct.entries()).map(
    ([productId, scope]) => ({
      productId,
      variantScope: (scope.entire ? 'entire' : 'specific') as 'entire' | 'specific',
      variantOptionIds: scope.entire ? [] : scope.variantIds,
    }),
  );

  return {
    buyerId: offer.buyerId || '',
    productSelections,
    enablePriceDiscount: isPrice,
    enableBuyXGetY: isBxgy || hasCombo,
    priceDiscountMode:
      offer.discountType === 'fixed_amount' ? 'fixed_amount' : 'percentage',
    discountValue: isPrice ? String(offer.discountValue ?? '') : '',
    buyQuantity: offer.buyQuantity != null ? String(offer.buyQuantity) : '',
    freeQuantity: freeFromOffer,
    promotionApplyMode:
      offer.promotionApplyMode === 'from_zero' ? 'from_zero' : 'after_moq',
    startDate: toDateInput(offer.startDate),
    endDate: toDateInput(offer.endDate),
    unlimitedEnd: !offer.endDate,
    status: (offer.status as OfferStatus) || 'draft',
    notes: offer.notes || '',
  };
}

/** Expand product selections into (productId, variantOptionId) rows for create/update. */
function expandProductTargets(
  selections: OfferWizardFormData['productSelections'],
  opts?: { allowEmpty?: boolean },
): Array<{ productId: string | null; variantOptionId: number | null }> {
  const targets: Array<{ productId: string | null; variantOptionId: number | null }> =
    [];
  for (const sel of selections) {
    if (!sel.productId) continue;
    if (sel.variantScope === 'entire') {
      targets.push({ productId: sel.productId, variantOptionId: null });
    } else {
      for (const variantOptionId of sel.variantOptionIds) {
        targets.push({ productId: sel.productId, variantOptionId });
      }
    }
  }
  if (targets.length === 0 && opts?.allowEmpty) {
    targets.push({ productId: null, variantOptionId: null });
  }
  return targets;
}

/** Encode wizard discount flags into API fields. */
function encodeDiscountPayload(formData: OfferWizardFormData): {
  discountType: string;
  discountValue: number;
  buyQuantity: number | null;
  freeQuantity: number | null;
} {
  const buy = Number.parseInt(formData.buyQuantity, 10);
  const free = Number.parseInt(formData.freeQuantity, 10);
  const buyOk = Number.isFinite(buy) && buy > 0 ? buy : null;
  const freeOk = Number.isFinite(free) && free > 0 ? free : null;

  if (formData.enablePriceDiscount && formData.enableBuyXGetY) {
    return {
      discountType: formData.priceDiscountMode,
      discountValue: Number.parseFloat(formData.discountValue),
      buyQuantity: buyOk,
      freeQuantity: freeOk,
    };
  }
  if (formData.enablePriceDiscount) {
    return {
      discountType: formData.priceDiscountMode,
      discountValue: Number.parseFloat(formData.discountValue),
      buyQuantity: null,
      freeQuantity: null,
    };
  }
  // BXGY only — discountValue stores free Y for legacy consumers
  return {
    discountType: 'buy_x_get_y',
    discountValue: freeOk ?? (Number.parseFloat(formData.discountValue) || 0),
    buyQuantity: buyOk,
    freeQuantity: freeOk,
  };
}

export function OfferFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useUserStore();
  const {
    tCreatePage,
    tDetailsPage,
    translateWizardTab,
    translateWizardTabDesc,
  } = useOffersTranslations();

  const offerIdParam = searchParams?.get('id') ?? null;
  const prefillBuyerId = searchParams?.get('buyerId') ?? null;

  const [activeTab, setActiveTab] = useState<TabId>('discount');
  const [formData, setFormData] = useState<OfferWizardFormData>(() =>
    emptyForm(prefillBuyerId),
  );
  const [buyers, setBuyers] = useState<BuyerOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [savingAsDraft, setSavingAsDraft] = useState(false);
  const [error, setError] = useState('');
  const [offerDbId, setOfferDbId] = useState<string | null>(null);
  const [editGroupId, setEditGroupId] = useState<string | null>(null);
  /** Stable create-mode groupId for the lifetime of this form session (retry-safe). */
  const pendingGroupIdRef = useRef<string | null>(null);

  const title = mode === 'create' ? tCreatePage('title') : tDetailsPage('title');
  const submitLabel =
    mode === 'create' ? tCreatePage('createRate') : tDetailsPage('saveRate');

  const tabs = TAB_IDS.map((id) => ({
    id,
    label: translateWizardTab(id),
    icon: TAB_ICONS[id],
    description: translateWizardTabDesc(id),
  }));

  const handleFormChange = useCallback((updates: Partial<OfferWizardFormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  }, []);

  const tabCompletion = useMemo<Record<TabId, boolean>>(
    () => ({
      discount: isDiscountTabComplete(formData),
      timing: isTimingTabComplete(formData),
      product: isProductTabComplete(formData),
      client: isClientTabComplete(formData),
    }),
    [formData],
  );

  const isReadyToSave = useMemo(
    () => TAB_IDS.every((id) => tabCompletion[id]),
    [tabCompletion],
  );

  /** Draft only needs a valid discount; client/product can be filled later. */
  const canSaveDraft = Boolean(tabCompletion.discount);

  const loadOptions = useCallback(async () => {
    if (!user?.id) return;
    const [buyersData, productsData] = await Promise.all([
      (async () => {
        const all: BuyerOption[] = [];
        let page = 1;
        let totalPages = 1;
        do {
          const data = await fetchGraphQL<{
            buyers: { nodes: BuyerOption[]; pagination: { totalPages?: number } };
          }>(BUYERS_QUERY, { userId: user.id, page, limit: 100 });
          all.push(...(data.buyers?.nodes ?? []));
          totalPages = Math.max(1, data.buyers?.pagination?.totalPages ?? 1);
          page += 1;
        } while (page <= totalPages);
        return all;
      })(),
      (async () => {
        const all: ProductOption[] = [];
        let page = 1;
        let totalPages = 1;
        do {
          const data = await fetchGraphQL<{
            products: {
              nodes: Array<ProductOption & { images?: string[] | null }>;
              pagination: { totalPages?: number };
            };
          }>(PRODUCTS_QUERY, { userId: user.id, page, limit: 100 });
          const nodes = (data.products?.nodes ?? []).map((n) => ({
            ...n,
            images: Array.isArray(n.images) ? n.images : [],
          }));
          all.push(...nodes);
          totalPages = Math.max(1, data.products?.pagination?.totalPages ?? 1);
          page += 1;
        } while (page <= totalPages);
        return all;
      })(),
    ]);
    setBuyers(buyersData);
    setProducts(productsData);
  }, [user?.id]);

  useEffect(() => {
    loadOptions().catch(() => {
      // Don't overwrite a more specific edit-load error
      setError((prev) => prev || tCreatePage('loadFailed'));
    });
  }, [loadOptions, tCreatePage]);

  useEffect(() => {
    if (mode !== 'edit' || !user?.id || !offerIdParam) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await fetchGraphQL<{ offersInGroup: Offer[] }>(
          `query OffersInGroup($userId: Int!, $id: String!) {
            offersInGroup(userId: $userId, id: $id) {
              id offerId groupId buyerId buyerStoreName productId productName categoryId categoryLabel
              variantOptionId variantName
              discountType discountValue buyQuantity freeQuantity promotionApplyMode startDate endDate status notes description
            }
          }`,
          { userId: user.id, id: offerIdParam },
        );
        const group = data.offersInGroup ?? [];

        if (cancelled) return;
        if (group.length === 0) {
          setError(tDetailsPage('notFound'));
          return;
        }
        setOfferDbId(group[0].id);
        setEditGroupId(group[0].groupId || null);
        setFormData(offersToForm(group));
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : tDetailsPage('loadFailed'),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, user?.id, offerIdParam, tDetailsPage]);

  const persistOffers = async (opts: {
    status: 'draft' | 'active';
    allowIncomplete: boolean;
  }) => {
    if (!user?.id) return;
    const encoded = encodeDiscountPayload(formData);
    const targets = expandProductTargets(formData.productSelections, {
      allowEmpty: opts.allowIncomplete,
    });
    if (targets.length === 0) {
      throw new Error(tCreatePage('productRequired'));
    }

    const groupId = (() => {
      if (editGroupId) return editGroupId;
      if (!pendingGroupIdRef.current) {
        pendingGroupIdRef.current =
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `grp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      }
      return pendingGroupIdRef.current;
    })();

    const result = await fetchGraphQL<{
      saveOfferGroup: { groupId: string; offers: Array<{ id: string; groupId: string | null }> };
    }>(SAVE_OFFER_GROUP_MUTATION, {
      userId: user.id,
      seedId:
        mode === 'edit' && (offerDbId || offerIdParam)
          ? offerDbId || offerIdParam
          : null,
      groupId,
      buyerId: formData.buyerId?.trim() || null,
      discountType: encoded.discountType,
      discountValue: encoded.discountValue,
      buyQuantity: encoded.buyQuantity,
      freeQuantity: encoded.freeQuantity,
      promotionApplyMode: formData.enableBuyXGetY
        ? formData.promotionApplyMode
        : 'after_moq',
      startDate: new Date(
        formData.startDate || new Date().toISOString().slice(0, 10),
      ).toISOString(),
      endDate:
        formData.unlimitedEnd || !formData.endDate
          ? null
          : new Date(formData.endDate).toISOString(),
      status: opts.status,
      notes: formData.notes || null,
      description: null,
      targets: targets.map((t) => ({
        productId: t.productId,
        variantOptionId: t.variantOptionId,
      })),
    });

    const saved = result.saveOfferGroup;
    if (saved?.groupId) setEditGroupId(saved.groupId);
    if (saved?.offers?.[0]?.id) setOfferDbId(saved.offers[0].id);
  };

  const handleSubmit = async () => {
    if (!user?.id || !isReadyToSave) return;
    setSaving(true);
    setError('');
    try {
      await persistOffers({
        status: formData.status === 'active' ? 'active' : 'draft',
        allowIncomplete: false,
      });
      router.push('/offers');
    } catch (err) {
      setError(err instanceof Error ? err.message : tCreatePage('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!user?.id || !canSaveDraft) return;
    setSavingAsDraft(true);
    setError('');
    try {
      await persistOffers({ status: 'draft', allowIncomplete: true });
      router.push('/offers');
    } catch (err) {
      setError(err instanceof Error ? err.message : tCreatePage('saveFailed'));
    } finally {
      setSavingAsDraft(false);
    }
  };

  const renderActiveTab = () => {
    const common = {
      formData,
      onFormChangeAction: handleFormChange,
    };
    switch (activeTab) {
      case 'discount':
        return <OfferDiscountTypeTab {...common} />;
      case 'timing':
        return <OfferTimingTab {...common} />;
      case 'product':
        return <OfferProductTab {...common} products={products} />;
      case 'client':
        return <OfferClientTab {...common} buyers={buyers} />;
      default:
        return null;
    }
  };

  if (loading) {
    return <SkeletonWizardPage tabs={4} actions={2} />;
  }

  return (
    <div className="flex min-h-full w-full min-w-0 flex-col space-y-4 bg-gradient-to-b from-gray-50 to-white p-4">
      <div className="flex min-w-0 flex-col gap-3 @5xl/main:flex-row @5xl/main:items-start @5xl/main:justify-between">
        <div className="flex min-w-0 flex-col gap-3 @3xl/main:flex-row @3xl/main:items-start">
          <button
            type="button"
            onClick={() => router.push('/offers')}
            className="flex w-full shrink-0 items-center justify-center gap-2 rounded-lg px-3 py-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800 @3xl/main:w-auto @3xl/main:justify-start"
          >
            <ArrowLeft className="h-4 w-4" />
            {tCreatePage('backToList')}
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold text-black">{title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-4">
              {tabs.map((t) => (
                <div key={t.id} className="flex items-center gap-2">
                  <div
                    className={`h-2 w-2 rounded-full ${
                      tabCompletion[t.id] ? 'bg-green-500' : 'bg-gray-300'
                    }`}
                  />
                  <span className="text-xs text-gray-600">{t.label}</span>
                </div>
              ))}
              {!isReadyToSave && (
                <div className="flex items-center gap-1 text-amber-600">
                  <AlertCircle className="h-3 w-3" />
                  <span className="text-xs">{tCreatePage('completeRequired')}</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-2 @4xl/main:flex-row @4xl/main:flex-wrap @4xl/main:items-center @5xl/main:w-auto">
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={!canSaveDraft || saving || savingAsDraft || !user?.id}
            className={`flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition @4xl/main:w-auto ${
              canSaveDraft && !saving && !savingAsDraft && user?.id
                ? 'border-[#0a61d7] bg-white text-[#0a61d7] hover:bg-[#f7faff]'
                : 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
            }`}
          >
            {savingAsDraft ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            {savingAsDraft ? tCreatePage('saving') : tCreatePage('saveDraft')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isReadyToSave || saving || savingAsDraft || !user?.id}
            className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition @4xl/main:w-auto ${
              isReadyToSave && !saving && !savingAsDraft && user?.id
                ? 'bg-[#0a61d7] text-white hover:bg-[#084ba6]'
                : 'cursor-not-allowed bg-gray-300 text-gray-500'
            }`}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4" />
            )}
            {saving ? tCreatePage('saving') : submitLabel}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-[#e6e6e6] bg-white p-1">
        <div className="flex flex-col gap-1 @5xl/main:flex-row">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-1 items-center justify-center gap-3 rounded-md px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-[#0a61d7] text-white'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-black'
              }`}
            >
              {tab.icon}
              <div className="text-left">
                <div>{tab.label}</div>
                <div
                  className={`text-xs ${
                    activeTab === tab.id ? 'text-white/80' : 'text-gray-400'
                  }`}
                >
                  {tab.description}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
        {renderActiveTab()}
      </div>
    </div>
  );
}

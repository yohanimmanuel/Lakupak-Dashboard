'use client';

import React, {
  useState,
  useMemo,
  useCallback,
  useRef,
  useLayoutEffect,
  useEffect,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Edit,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  Filter,
  ChevronDown,
  Gift,
  Users,
  PlayCircle,
  PauseCircle,
  Trash,
  Check,
} from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';
import { format, subDays, startOfYear, isAfter } from 'date-fns';
import { Offer } from '@/types/offer';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useOffersTranslations } from '@/hooks/useOffersTranslations';

const STATUS_TABS = ['All', 'Active', 'Draft', 'Expired'] as const;
const STATUS_FILTERS = ['All', 'Active', 'Draft', 'Expired'] as const;
const NO_CLIENT_FILTER = '__none__';

const DATE_FILTERS = [
  'All Time',
  'Last 7 Days',
  'Last 30 Days',
  'Last 3 Months',
  'This Year',
] as const;

type BuyerOption = {
  buyerId: string;
  storeName: string;
  owner: string;
};

export type OfferGroup = {
  key: string;
  primary: Offer;
  members: Offer[];
};

export function formatDiscount(offer: Offer, currency: string): string {
  const free =
    offer.freeQuantity != null && offer.freeQuantity > 0
      ? offer.freeQuantity
      : offer.discountType === 'buy_x_get_y'
        ? Math.round(offer.discountValue)
        : null;
  const hasBxgy =
    offer.buyQuantity != null &&
    offer.buyQuantity > 0 &&
    free != null &&
    free > 0;

  switch (offer.discountType) {
    case 'percentage': {
      const price = `${offer.discountValue}%`;
      return hasBxgy
        ? `${price} + Buy ${offer.buyQuantity} get ${free}`
        : price;
    }
    case 'fixed_amount': {
      const price = `${formatCurrency(offer.discountValue, currency)} off`;
      return hasBxgy
        ? `${price} + Buy ${offer.buyQuantity} get ${free}`
        : price;
    }
    case 'buy_x_get_y':
      return `Buy ${offer.buyQuantity ?? 'X'} get ${free ?? Math.round(offer.discountValue)}`;
    default:
      return String(offer.discountValue);
  }
}

function formatDuration(offer: Offer, unlimitedLabel = 'Unlimited'): string {
  try {
    if (!offer.endDate) return unlimitedLabel;
    const start = format(new Date(offer.startDate), 'dd MMM yyyy');
    const end = format(new Date(offer.endDate), 'dd MMM yyyy');
    return `${start} → ${end}`;
  } catch {
    return '—';
  }
}

function productVariantLabel(offer: Offer, allVariantsLabel: string): string {
  if (offer.productName) {
    if (offer.variantName) {
      return `${offer.productName} · ${offer.variantName}`;
    }
    return `${offer.productName} (${allVariantsLabel})`;
  }
  return offer.categoryLabel || offer.categoryId || '—';
}

/** Stable key so multi-product / multi-variant rows render as one offer group. */
export function offerGroupKey(offer: Offer): string {
  if (offer.groupId) return `g:${offer.groupId}`;
  return [
    'h',
    offer.buyerId || '',
    offer.discountType,
    String(offer.discountValue),
    offer.buyQuantity ?? '',
    offer.freeQuantity ?? '',
    offer.startDate?.slice?.(0, 10) || offer.startDate || '',
    offer.endDate?.slice?.(0, 10) || offer.endDate || '',
    offer.status,
    offer.notes || '',
  ].join('|');
}

export function groupOffers(offers: Offer[]): OfferGroup[] {
  const map = new Map<string, Offer[]>();
  for (const offer of offers) {
    const key = offerGroupKey(offer);
    const list = map.get(key);
    if (list) list.push(offer);
    else map.set(key, [offer]);
  }
  return Array.from(map.entries()).map(([key, members]) => {
    const sorted = [...members].sort(
      (a, b) =>
        new Date(b.updatedAt || b.createdAt).getTime() -
        new Date(a.updatedAt || a.createdAt).getTime(),
    );
    return { key, primary: sorted[0], members: sorted };
  });
}

function groupProductsLabel(
  group: OfferGroup,
  allVariantsLabel: string,
  noProductLabel: string,
  moreLabel: (count: number) => string,
): string {
  const withProduct = group.members.filter((o) => o.productId || o.categoryId);
  if (withProduct.length === 0) return noProductLabel;

  const byProduct = new Map<string, Offer[]>();
  for (const o of withProduct) {
    const pid = o.productId || o.categoryId || o.id;
    const list = byProduct.get(pid);
    if (list) list.push(o);
    else byProduct.set(pid, [o]);
  }

  const lines: string[] = [];
  for (const rows of byProduct.values()) {
    const first = rows[0];
    const allEntire =
      rows.length === 1 && first.variantOptionId == null && Boolean(first.productId);
    const allSpecific =
      rows.every((r) => r.variantOptionId != null) &&
      rows.length > 0 &&
      Boolean(first.productName);

    if (allEntire) {
      lines.push(`${first.productName} (${allVariantsLabel})`);
    } else if (allSpecific && rows.length > 1) {
      const variants = rows
        .map((r) => r.variantName)
        .filter(Boolean)
        .join(', ');
      lines.push(
        variants
          ? `${first.productName} · ${variants}`
          : productVariantLabel(first, allVariantsLabel),
      );
    } else {
      lines.push(productVariantLabel(first, allVariantsLabel));
    }
  }

  if (lines.length <= 2) return lines.join(', ');
  return `${lines.slice(0, 2).join(', ')} ${moreLabel(lines.length - 2)}`;
}

function matchesDateFilter(
  offer: Offer,
  filter: (typeof DATE_FILTERS)[number],
): boolean {
  if (filter === 'All Time') return true;
  const created = new Date(offer.createdAt || offer.startDate);
  const now = new Date();
  switch (filter) {
    case 'Last 7 Days':
      return isAfter(created, subDays(now, 7));
    case 'Last 30 Days':
      return isAfter(created, subDays(now, 30));
    case 'Last 3 Months':
      return isAfter(created, subDays(now, 90));
    case 'This Year':
      return isAfter(created, startOfYear(now)) || created.getFullYear() === now.getFullYear();
    default:
      return true;
  }
}

const UPDATE_STATUS_MUTATION = `
  mutation UpdateOfferStatus($userId: Int!, $id: String!, $status: String!) {
    updateOffer(userId: $userId, id: $id, status: $status) { id status }
  }
`;

const DELETE_OFFER_MUTATION = `
  mutation DeleteOffer($userId: Int!, $id: String!) {
    deleteOffer(userId: $userId, id: $id) { success deletedCount }
  }
`;

const BUYERS_QUERY = `
  query OfferTableBuyers($userId: Int!, $page: Int, $limit: Int) {
    buyers(userId: $userId, page: $page, limit: $limit) {
      nodes { buyerId storeName owner }
      pagination { totalPages }
    }
  }
`;

export default function OfferTable({ 
  offers = [], 
  setOffersAction, 
  onRefreshAction,
}: { 
  offers?: Offer[]; 
  setOffersAction?: (fn: (prev: Offer[]) => Offer[]) => void; 
  onRefreshAction?: () => void;
}) {
  const {
    tTable,
    tShared,
    translateOfferStatus,
    translateStatusTab,
    translateDateFilter,
  } = useOffersTranslations();
  const user = useUserStore((state) => state.user);
  const router = useRouter();
  const userCurrency = user?.currency || getDefaultCurrency();
  
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedTab, setSelectedTab] = useState<(typeof STATUS_TABS)[number]>('All');
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>('All');
  const [dateFilter, setDateFilter] = useState<(typeof DATE_FILTERS)[number]>('All Time');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [clientSearch, setClientSearch] = useState('');
  const [buyers, setBuyers] = useState<BuyerOption[]>([]);
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<OfferGroup | null>(null);
  const [isBulkDelete, setIsBulkDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isBulkWorking, setIsBulkWorking] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [bulkError, setBulkError] = useState('');
  const rowsPerPage = 8;

  useEffect(() => {
    if (!bulkError) return;
    const timer = window.setTimeout(() => setBulkError(''), 5000);
    return () => window.clearTimeout(timer);
  }, [bulkError]);
  
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });
  const clientDropdownRef = useRef<HTMLDivElement>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const dateDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const all: BuyerOption[] = [];
        let pageNum = 1;
        let totalPages = 1;
        do {
          const data = await fetchGraphQL<{
            buyers: {
              nodes: BuyerOption[];
              pagination: { totalPages?: number };
            };
          }>(BUYERS_QUERY, { userId: user.id, page: pageNum, limit: 100 });
          all.push(...(data.buyers?.nodes ?? []));
          totalPages = Math.max(1, data.buyers?.pagination?.totalPages ?? 1);
          pageNum += 1;
        } while (pageNum <= totalPages && !cancelled);
        if (!cancelled) setBuyers(all);
      } catch {
        if (!cancelled) setBuyers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(target)) {
        setShowClientDropdown(false);
      }
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(target)) {
        setShowStatusDropdown(false);
      }
      if (dateDropdownRef.current && !dateDropdownRef.current.contains(target)) {
        setShowDateDropdown(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  useLayoutEffect(() => {
    if (tabRefs.current.length > 0) {
      const activeTab = tabRefs.current.find(
        (tab, index) => STATUS_TABS[index] === selectedTab,
      );
      if (activeTab) {
        setIndicatorStyle({
          left: activeTab.offsetLeft,
          width: activeTab.offsetWidth,
        });
      }
    }
  }, [selectedTab]);

  const setStatusBoth = (value: (typeof STATUS_TABS)[number]) => {
    setSelectedTab(value);
    setStatusFilter(value);
    setPage(1);
    setSelectedKeys([]);
  };

  const clientOptions = useMemo(() => {
    const map = new Map<string, BuyerOption>();
    for (const b of buyers) map.set(b.buyerId, b);
    for (const o of offers) {
      if (o.buyerId && !map.has(o.buyerId)) {
        map.set(o.buyerId, {
          buyerId: o.buyerId,
          storeName: o.buyerStoreName || o.buyerId,
          owner: o.buyerOwner || '',
        });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.storeName.localeCompare(b.storeName),
    );
  }, [buyers, offers]);

  const filteredClientOptions = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return clientOptions;
    return clientOptions.filter(
      (b) =>
        b.storeName.toLowerCase().includes(q) ||
        b.owner.toLowerCase().includes(q) ||
        b.buyerId.toLowerCase().includes(q),
    );
  }, [clientOptions, clientSearch]);

  const selectedClientLabel = useMemo(() => {
    if (clientFilter === 'all') return tTable('allClients');
    if (clientFilter === NO_CLIENT_FILTER) return tTable('noClientAssigned');
    const found = clientOptions.find((b) => b.buyerId === clientFilter);
    return found?.storeName || clientFilter;
  }, [clientFilter, clientOptions, tTable]);

  const filteredOffers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const status = statusFilter !== 'All' ? statusFilter : selectedTab;
    return offers.filter((offer) => {
      if (status !== 'All' && offer.status.toLowerCase() !== status.toLowerCase()) {
        return false;
      }
      if (!matchesDateFilter(offer, dateFilter)) return false;
      if (clientFilter === NO_CLIENT_FILTER) {
        if (offer.buyerId) return false;
      } else if (clientFilter !== 'all') {
        if (offer.buyerId !== clientFilter) return false;
      }
      if (!q) return true;
      const hay = [
        offer.offerId,
        offer.buyerStoreName,
        offer.buyerOwner,
        offer.buyerId,
        offer.productName,
        offer.variantName,
        offer.categoryLabel,
        offer.categoryId,
        offer.notes,
        offer.discountType,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [offers, search, selectedTab, statusFilter, dateFilter, clientFilter]);

  const filteredGroups = useMemo(
    () => groupOffers(filteredOffers),
    [filteredOffers],
  );

  const totalPages = Math.max(1, Math.ceil(filteredGroups.length / rowsPerPage));
  const safePage = Math.min(page, totalPages);
  const paged = filteredGroups.slice((safePage - 1) * rowsPerPage, safePage * rowsPerPage);
  const fromRow = filteredGroups.length === 0 ? 0 : (safePage - 1) * rowsPerPage + 1;
  const toRow = Math.min(safePage * rowsPerPage, filteredGroups.length);

  const allFilteredKeys = useMemo(
    () => filteredGroups.map((g) => g.key),
    [filteredGroups],
  );
  const allFilteredSelected =
    allFilteredKeys.length > 0 &&
    allFilteredKeys.every((k) => selectedKeys.includes(k));

  const selectedGroups = useMemo(
    () => filteredGroups.filter((g) => selectedKeys.includes(g.key)),
    [filteredGroups, selectedKeys],
  );

  const toggleSelect = (key: string) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const handleSelectAll = () => {
    if (allFilteredSelected) setSelectedKeys([]);
    else setSelectedKeys(allFilteredKeys);
  };

  const handleBulkStatus = useCallback(
    async (nextStatus: 'active' | 'draft') => {
      if (!user?.id || selectedGroups.length === 0) return;
      setIsBulkWorking(true);
      setBulkError('');
      let success = 0;
      let failedNoClient = 0;
      let failedOther = 0;
      const savedStatusById = new Map<string, string>();

      try {
        for (const group of selectedGroups) {
          // Activate requires a client on every member
          if (nextStatus === 'active' && !group.primary.buyerId) {
            failedNoClient += 1;
            continue;
          }
          if (nextStatus === 'active' && group.primary.status === 'expired') {
            failedOther += 1;
            continue;
          }
          try {
            let blockedNoClient = false;
            let blockedOther = false;
            // One update per group member keeps status in sync across product targets
            for (const member of group.members) {
              const data = await fetchGraphQL<{
                updateOffer: { id: string; status: string };
              }>(UPDATE_STATUS_MUTATION, {
                userId: user.id,
                id: member.id,
                status: nextStatus,
              });
              const savedStatus = data.updateOffer?.status;
              if (savedStatus) savedStatusById.set(member.id, savedStatus);
              // Missing buyerId is saved as draft and still returns success
              if (nextStatus === 'active' && savedStatus !== 'active') {
                if (savedStatus === 'draft') blockedNoClient = true;
                else blockedOther = true;
              }
            }
            if (blockedNoClient || blockedOther) {
              if (blockedNoClient && !blockedOther) failedNoClient += 1;
              else failedOther += 1;
            } else {
              success += 1;
            }
          } catch {
            failedOther += 1;
          }
        }

        setOffersAction?.((prev) =>
          prev.map((o) => {
            const savedStatus = savedStatusById.get(o.id);
            if (!savedStatus || savedStatus === o.status) return o;
            return { ...o, status: savedStatus };
          }),
        );
        setSelectedKeys([]);
        onRefreshAction?.();
        const failed = failedNoClient + failedOther;
        if (failed > 0) {
          if (nextStatus === 'active' && failedNoClient > 0 && failedOther === 0) {
            setBulkError(
              success > 0
                ? tTable('activatePartialNoClient', {
                    success: String(success),
                    failed: String(failedNoClient),
                  })
                : tTable('activateFailedNoClient', { count: String(failedNoClient) }),
            );
          } else if (nextStatus === 'active' && failedNoClient > 0) {
            setBulkError(
              tTable('activatePartialMixedNoClient', {
                success: String(success),
                noClient: String(failedNoClient),
                other: String(failedOther),
              }),
            );
          } else {
            setBulkError(
              nextStatus === 'active'
                ? tTable('activatePartialSuccess', {
                    success: String(success),
                    failed: String(failed),
                  })
                : tTable('deactivatePartialSuccess', {
                    success: String(success),
                    failed: String(failed),
                  }),
            );
          }
        }
      } catch {
        setBulkError(
          nextStatus === 'active'
            ? tTable('activateFailedGeneric')
            : tTable('deactivateFailedGeneric'),
        );
      } finally {
        setIsBulkWorking(false);
      }
    },
    [user?.id, selectedGroups, setOffersAction, onRefreshAction, tTable],
  );

  const handleDelete = useCallback(async () => {
    if (!user?.id) return;
    setIsDeleting(true);
    setDeleteError('');
    try {
      if (isBulkDelete) {
        for (const group of selectedGroups) {
          await fetchGraphQL(DELETE_OFFER_MUTATION, {
            userId: user.id,
            id: group.primary.id,
          });
        }
        const remove = new Set(
          selectedGroups.flatMap((g) => g.members.map((m) => m.id)),
        );
        setOffersAction?.((prev) => prev.filter((o) => !remove.has(o.id)));
        setSelectedKeys([]);
      } else if (groupToDelete) {
        await fetchGraphQL(DELETE_OFFER_MUTATION, {
          userId: user.id,
          id: groupToDelete.primary.id,
        });
        const remove = new Set(groupToDelete.members.map((m) => m.id));
        setOffersAction?.((prev) => prev.filter((o) => !remove.has(o.id)));
      }
      setShowDeleteModal(false);
      setGroupToDelete(null);
      setIsBulkDelete(false);
      onRefreshAction?.();
    } catch {
      setDeleteError(
        isBulkDelete
          ? tTable('deleteFailedBulk', { count: String(selectedGroups.length) })
          : tTable('deleteFailedSingle'),
      );
    } finally {
      setIsDeleting(false);
    }
  }, [
    user?.id,
    isBulkDelete,
    selectedGroups,
    groupToDelete,
    setOffersAction,
    onRefreshAction,
    tTable,
  ]);

  const allVariantsLabel = tTable('allVariants');
  const unlimitedLabel = tTable('unlimited');
  const moreProductsLabel = (count: number) =>
    tTable('moreProducts', { count: String(count) });

  return (
    <div
      className="w-full mx-auto bg-white rounded-lg border border-[#e6e6e6] p-4 mt-3"
      data-tour="offers-table"
    >
      {/* Status Tabs */}
      <div className="mb-4">
        <div className="relative w-full md:w-auto flex items-center">
          <div className="flex w-full md:w-auto bg-gray-100 rounded-lg overflow-hidden relative">
            <div
              className="absolute top-0 h-full transition-all duration-300"
              style={{
                left: indicatorStyle.left,
                width: indicatorStyle.width,
                background: '#0a61d7',
                borderRadius: '0.75rem',
                zIndex: 1,
              }}
            />
            {STATUS_TABS.map((tab, idx) => (
              <button
                key={tab}
                ref={(el) => {
                  tabRefs.current[idx] = el;
                }}
                type="button"
                onClick={() => setStatusBoth(tab)}
                className={`relative z-10 flex-1 px-6 py-2 font-medium text-[14px] transition-colors duration-200 focus:outline-none ${
                  selectedTab === tab
                    ? 'text-white'
                    : 'text-gray-700 hover:text-[#0a61d7]'
                } ${
                  idx === 0
                    ? 'rounded-l-lg'
                    : idx === STATUS_TABS.length - 1
                      ? 'rounded-r-lg'
                      : ''
                }`}
                style={{
                  background: 'transparent',
                  boxShadow: 'none',
                  minWidth: 0,
                  flex: 'unset',
                }}
              >
                {translateStatusTab(tab)}
              </button>
            ))}
          </div>
          </div>
        </div>

        {/* Search and Filters */}
      <div className="flex flex-wrap gap-2 w-full items-center justify-start mb-4">
          <div className="relative w-full md:w-64 shrink-0">
            <input
              type="text"
              placeholder={tTable('searchPlaceholder')}
              value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-[#e6e6e6] text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#0a61d7] bg-white"
            maxLength={100}
            />
            <Search className="absolute left-3 top-2 text-gray-400 w-5 h-5" />
          </div>

        {/* Client filter with searchable list */}
        <div className="relative" ref={clientDropdownRef}>
          <button
            type="button"
            className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-100 text-sm whitespace-nowrap max-w-[220px]"
            onClick={() => {
              setShowClientDropdown((v) => !v);
              setShowStatusDropdown(false);
              setShowDateDropdown(false);
            }}
          >
            <Users className="w-4 h-4 shrink-0" />
            <span className="truncate">{selectedClientLabel}</span>
            <ChevronDown className="w-4 h-4 ml-1 text-gray-500 shrink-0" />
          </button>
          {showClientDropdown && (
            <div className="absolute left-0 mt-2 w-72 bg-white border border-[#e6e6e6] rounded-lg shadow-lg z-30 overflow-hidden">
              <div className="p-2 border-b border-[#e6e6e6]">
           <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input
                    type="text"
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    placeholder={tTable('searchClientsFilter')}
                    className="w-full pl-8 pr-3 py-1.5 text-xs text-black border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#0a61d7]"
                    autoFocus
                  />
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto">
             <button
                  type="button"
                  onClick={() => {
                    setClientFilter('all');
                    setShowClientDropdown(false);
                    setClientSearch('');
                    setPage(1);
                    setSelectedKeys([]);
                  }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${
                    clientFilter === 'all' ? 'font-bold text-[#0a61d7]' : 'text-gray-700'
                  }`}
                >
                  {tTable('allClients')}
             </button>
                   <button
                  type="button"
                     onClick={() => {
                    setClientFilter(NO_CLIENT_FILTER);
                    setShowClientDropdown(false);
                    setClientSearch('');
                    setPage(1);
                    setSelectedKeys([]);
                  }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${
                    clientFilter === NO_CLIENT_FILTER
                      ? 'font-bold text-[#0a61d7]'
                      : 'text-gray-700'
                  }`}
                >
                  {tTable('noClientAssigned')}
                </button>
                {filteredClientOptions.length === 0
                  ? clientSearch.trim()
                    ? (
                        <p className="px-4 py-3 text-xs text-gray-500">
                          {tTable('noClientsFound')}
                        </p>
                      )
                    : null
                  : filteredClientOptions.map((b) => (
                      <button
                        key={b.buyerId}
                        type="button"
                        onClick={() => {
                          setClientFilter(b.buyerId);
                          setShowClientDropdown(false);
                          setClientSearch('');
                          setPage(1);
                          setSelectedKeys([]);
                        }}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${
                          clientFilter === b.buyerId
                            ? 'font-bold text-[#0a61d7] bg-blue-50'
                            : 'text-gray-700'
                        }`}
                      >
                        <div className="truncate font-medium">{b.storeName}</div>
                        {b.owner && (
                          <div className="text-xs text-gray-500 truncate">{b.owner}</div>
                        )}
                   </button>
                 ))}
              </div>
               </div>
             )}
      </div>

        {/* Status filter dropdown */}
        <div className="relative" ref={statusDropdownRef}>
              <button
            type="button"
            className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-100 text-sm whitespace-nowrap"
            onClick={() => {
              setShowStatusDropdown((v) => !v);
              setShowClientDropdown(false);
              setShowDateDropdown(false);
            }}
          >
            <Filter className="w-4 h-4" />
            {tTable('filterStatus')}: {translateStatusTab(statusFilter)}
            <ChevronDown className="w-4 h-4 ml-1 text-gray-500" />
              </button>
          {showStatusDropdown && (
            <div className="absolute left-0 mt-2 w-44 bg-white border border-[#e6e6e6] rounded-lg shadow z-20">
              {STATUS_FILTERS.map((opt) => (
              <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    setStatusBoth(opt);
                    setShowStatusDropdown(false);
                  }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${
                    statusFilter === opt
                      ? 'font-bold text-[#0a61d7]'
                      : 'text-gray-700'
                  }`}
                >
                  {translateStatusTab(opt)}
              </button>
              ))}
            </div>
          )}
        </div>

        {/* Date filter */}
        <div className="relative" ref={dateDropdownRef}>
              <button
            type="button"
            className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-100 text-sm whitespace-nowrap"
            onClick={() => {
              setShowDateDropdown((v) => !v);
              setShowClientDropdown(false);
              setShowStatusDropdown(false);
            }}
          >
            <Filter className="w-4 h-4" />
            {translateDateFilter(dateFilter)}
            <ChevronDown className="w-4 h-4 ml-1 text-gray-500" />
              </button>
          {showDateDropdown && (
            <div className="absolute right-0 mt-2 w-44 bg-white border border-[#e6e6e6] rounded-lg shadow z-20">
              {DATE_FILTERS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    setDateFilter(opt);
                    setShowDateDropdown(false);
                    setPage(1);
                    setSelectedKeys([]);
                  }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${
                    dateFilter === opt
                      ? 'font-bold text-[#0a61d7]'
                      : 'text-gray-700'
                  }`}
                >
                  {translateDateFilter(opt)}
                </button>
              ))}
            </div>
          )}
            </div>
          </div>
          
      {bulkError && (
        <div className="mb-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
          {bulkError}
        </div>
      )}

      {/* Bulk Action Bar — AutomationTable colors */}
      {selectedKeys.length > 0 && (
        <div className="bg-white border border-[#e6e6e6] border-l-4 border-l-green-500 rounded-lg p-3 md:p-4 mb-3 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <span className="text-sm font-semibold text-[#0a61d7]">
              {selectedKeys.length}{' '}
              {selectedKeys.length === 1
                ? tTable('offerSelected')
                : tTable('offersSelected')}{' '}
              {tTable('selected')}
            </span>
            <div className="flex items-center gap-2 md:gap-4">
              <span className="hidden md:block text-gray-600 text-xs font-semibold">
                {tTable('bulkActionHint')}
              </span>
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  disabled={isBulkWorking}
                  onClick={() => handleBulkStatus('active')}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white font-semibold text-sm rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {isBulkWorking ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                  <PlayCircle className="w-4 h-4" />
                  )}
                  {tTable('activate')}
                </button>
                <button
                  type="button"
                  disabled={isBulkWorking}
                  onClick={() => handleBulkStatus('draft')}
                  className="flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white font-semibold text-sm rounded-lg hover:bg-yellow-700 transition-colors disabled:opacity-50"
                >
                  {isBulkWorking ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                  <PauseCircle className="w-4 h-4" />
                  )}
                  {tTable('deactivate')}
                </button>
                <button
                  type="button"
                  disabled={isBulkWorking}
                  onClick={() => {
                    setIsBulkDelete(true);
                    setGroupToDelete(null);
                    setDeleteError('');
                    setShowDeleteModal(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold text-sm rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  <Trash className="w-4 h-4" />
                  {tTable('remove')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Table */}
      <div className="overflow-x-auto hidden md:block rounded-lg">
        <table className="min-w-full text-sm text-left whitespace-nowrap text-xs">
          <thead className="bg-gray-100 text-gray-500 whitespace-nowrap">
            <tr>
              <th className="py-3 px-4 font-medium uppercase w-10">
                  <button
                  type="button"
                    onClick={handleSelectAll}
                  aria-label={tTable('selectAll')}
                    className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                      allFilteredSelected
                        ? 'bg-green-500 border-green-500'
                        : 'bg-white border-gray-300 hover:border-green-400'
                    }`}
                  >
                  {allFilteredSelected && <Check className="w-3 h-3 text-white" />}
                  </button>
                </th>
              <th className="py-3 px-4 font-medium uppercase">{tTable('columns.client')}</th>
              <th className="py-3 px-4 font-medium uppercase">{tTable('columns.target')}</th>
              <th className="py-3 px-4 font-medium uppercase">{tTable('columns.discount')}</th>
              <th className="py-3 px-4 font-medium uppercase">{tTable('columns.status')}</th>
              <th className="py-3 px-4 font-medium uppercase">{tTable('columns.duration')}</th>
              <th className="py-3 px-4 font-medium uppercase text-center">
                {tTable('columns.actions')}
              </th>
              </tr>
            </thead>
          <tbody className="bg-white">
            {filteredGroups.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-gray-500">
                  <div className="flex flex-col items-center gap-2">
                    <Gift className="w-12 h-12 text-gray-400" />
                    <p className="text-sm">{tTable('empty')}</p>
                  </div>
                </td>
              </tr>
            ) : (
              paged.map((group) => {
                const offer = group.primary;
                const selected = selectedKeys.includes(group.key);
                const productsLabel = groupProductsLabel(
                  group,
                  allVariantsLabel,
                  tTable('noProductAssigned'),
                  moreProductsLabel,
                );
                return (
                  <tr
                    key={group.key}
                    className={`border-b border-[#f0f0f0] cursor-pointer transition ${
                      selected ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('button')) return;
                      toggleSelect(group.key);
                    }}
                  >
                    <td className="py-3 px-4">
                  <button
                        type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                          toggleSelect(group.key);
                    }}
                        aria-label={tTable('selectRow')}
                    className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                          selected
                        ? 'bg-green-500 border-green-500'
                        : 'bg-white border-gray-300 hover:border-green-400'
                    }`}
                  >
                        {selected && <Check className="w-3 h-3 text-white" />}
                  </button>
                </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-black">
                        {offer.buyerStoreName ||
                          offer.buyerId ||
                          tTable('noClientAssigned')}
                      </div>
                      {offer.buyerOwner && (
                        <div className="text-xs text-gray-500">{offer.buyerOwner}</div>
                      )}
                </td>
                    <td className="py-3 px-4 text-black whitespace-normal max-w-xs">
                      <div className="line-clamp-3">{productsLabel}</div>
                      {group.members.length > 1 && (
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          {tTable('productsInGroup', {
                            count: String(
                              new Set(
                                group.members
                                  .map((m) => m.productId || m.categoryId)
                                  .filter(Boolean),
                              ).size || group.members.length,
                            ),
                          })}
                        </div>
                      )}
                </td>
                    <td className="py-3 px-4 text-black">
                      {formatDiscount(offer, userCurrency)}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2 py-1 rounded-full text-xs font-bold ${
                          offer.status === 'active'
                            ? 'bg-green-100 text-green-500'
                            : offer.status === 'expired'
                              ? 'bg-gray-100 text-gray-500'
                              : offer.status === 'draft'
                                ? 'bg-yellow-100 text-yellow-500'
                                : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {translateOfferStatus(offer.status)}
                  </span>
                </td>
                    <td className="py-3 px-4 text-gray-600 whitespace-nowrap">
                      {formatDuration(offer, unlimitedLabel)}
                </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                    <button
                          type="button"
                          className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-gray-100 transition-colors focus:outline-none"
                          title={tTable('editOffer')}
                      onClick={(e) => {
                        e.stopPropagation();
                            router.push(`/offers/details?id=${offer.id}`);
                      }}
                    >
                      <Edit className="w-4 h-4 text-gray-500" />
                    </button>
                    <button
                          type="button"
                          className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-red-100 transition-colors focus:outline-none"
                          title={tTable('deleteOffer')}
                      onClick={(e) => {
                        e.stopPropagation();
                            setIsBulkDelete(false);
                            setGroupToDelete(group);
                            setDeleteError('');
                            setShowDeleteModal(true);
                      }}
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </button>
                  </div>
                </td>
              </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden">
        {paged.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Gift className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p className="text-sm">{tTable('empty')}</p>
        </div>
        ) : (
          <div className="space-y-3">
            {paged.map((group) => {
              const offer = group.primary;
              const selected = selectedKeys.includes(group.key);
              const productsLabel = groupProductsLabel(
                group,
                allVariantsLabel,
                tTable('noProductAssigned'),
                moreProductsLabel,
              );
              return (
                <div
                  key={group.key}
                  className={`border rounded-lg p-4 space-y-2 ${
                    selected
                      ? 'border-[#0a61d7] bg-blue-50'
                      : 'border-[#e6e6e6]'
                  }`}
                  onClick={() => toggleSelect(group.key)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
          <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelect(group.key);
                        }}
                        className={`mt-0.5 w-4 h-4 shrink-0 border-2 rounded flex items-center justify-center ${
                          selected
                            ? 'bg-green-500 border-green-500'
                            : 'bg-white border-gray-300'
                        }`}
                      >
                        {selected && <Check className="w-3 h-3 text-white" />}
          </button>
                      <div className="min-w-0">
                        <div className="font-medium text-black">
                          {offer.buyerStoreName ||
                            offer.buyerId ||
                            tTable('noClientAssigned')}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {productsLabel}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`inline-block px-2 py-1 rounded-full text-xs font-bold shrink-0 ${
                        offer.status === 'active'
                          ? 'bg-green-100 text-green-500'
                          : offer.status === 'draft'
                            ? 'bg-yellow-100 text-yellow-500'
                            : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {translateOfferStatus(offer.status)}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600">
                    {formatDiscount(offer, userCurrency)} ·{' '}
                    {formatDuration(offer, unlimitedLabel)}
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-gray-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/offers/details?id=${offer.id}`);
                      }}
                    >
                      <Edit className="w-4 h-4 text-gray-500" />
                </button>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-red-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsBulkDelete(false);
                        setGroupToDelete(group);
                        setDeleteError('');
                        setShowDeleteModal(true);
                      }}
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mt-6 gap-2">
        <div className="text-sm text-gray-500">
          {tTable('pagination.showing', {
            from: String(fromRow),
            to: String(toRow),
            total: String(filteredGroups.length),
          })}
        </div>
        <div className="flex items-center gap-3">
                <button
            type="button"
            className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage === 1}
          >
            <ChevronLeft className="w-4 h-4 text-gray-500" />
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              type="button"
              className={`px-3 py-2 rounded-lg font-semibold text-sm transition ${
                p === safePage
                      ? 'bg-[#0a61d7] text-white'
                  : 'bg-white text-[#0a61d7] hover:bg-[#f7faff]'
                  }`}
              onClick={() => setPage(p)}
                >
              {p}
                </button>
          ))}
          <button
            type="button"
            className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage === totalPages}
          >
            <ChevronRight className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>

      {showDeleteModal && (groupToDelete || isBulkDelete) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg border border-[#e6e6e6] p-4 w-full max-w-sm">
            <h2 className="text-lg font-bold mb-2 text-red-500">
              {isBulkDelete ? tTable('deleteOffersTitle') : tTable('deleteOffer')}
            </h2>
            {deleteError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <span className="text-red-700 text-sm">{deleteError}</span>
              </div>
            )}
            <p className="mb-4 text-gray-500">
              {isBulkDelete 
                ? tTable('deleteBulkConfirm', { count: String(selectedKeys.length) })
                : groupToDelete && groupToDelete.members.length > 1
                  ? tTable('deleteGroupConfirm', { count: String(groupToDelete.members.length) })
                  : tTable('deleteConfirm')}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
                onClick={() => {
                  setShowDeleteModal(false);
                  setGroupToDelete(null);
                  setIsBulkDelete(false);
                }}
                disabled={isDeleting}
              >
                {tShared('cancel')}
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 flex items-center gap-2 disabled:opacity-50"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {tShared('deleting')}
                  </>
                ) : (
                  tShared('delete')
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';
import React, { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Trash, Archive, RotateCcw, Plus, AlertCircle, CheckCircle, ChevronDown, ChevronLeft, ChevronRight, ArrowLeft, Save, Upload, Download, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import { useUserStore } from '@/store/userStore';
import { Supplier, SupplyDetail, SupplierFormData } from '@/types/client';
import type { StockLevel } from '@/types/product';
import { convertSupplyQuantityToPieces, getSupplyUnitOptions } from '@/lib/suppliers/supplyPackageUnits';
import { getDefaultCurrency, getCurrencySymbol } from '@/utils/currencyUtils';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useClientsTranslations } from '@/hooks/useClientsTranslations';
import { getVisiblePageNumbers } from '@/utils/tablePagination';
import {
  validateOptionalEmail,
  validateRequiredPhone,
  validateRequiredField,
  mapSupplierFieldError,
  clearValidationField,
} from '@/utils/client-input-validation';
import { ClientField, ClientInput } from '@/components/clientmanagement/ClientField';
import { ClientValidatedField } from '@/components/clientmanagement/ClientValidatedField';
import { CLIENT_SELECT_BUTTON_CLASS } from '@/components/clientmanagement/client-field-styles';
import ImportSuppliesModal from '@/components/clientmanagement/ImportSuppliesModal';
import ImportSelectionCheckbox from '@/components/clientmanagement/ImportSelectionCheckbox';
import ClientCatalogSelect from '@/components/clientmanagement/ClientCatalogSelect';
import {
  buildSupplySummaryFromHistory,
  getSupplyReceivedInput,
  partitionSupplies,
  serializeHistorySupplyForStorage,
} from '@/lib/suppliers/supplyRecords';
import type { SupplyDeleteMarker } from '@/lib/suppliers/applySupplierSuppliesSave';

const categories = ["Instant Noodles", "Mineral Water", "Rice", "Bread"];
const statusOptions = ["Active", "Inactive", "Blocked"];

const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

type Weekday = (typeof WEEKDAYS)[number];

const WEEKDAY_ALIASES: Record<string, Weekday> = {
  mon: 'Monday', monday: 'Monday', mons: 'Monday', mondays: 'Monday', sen: 'Monday', senin: 'Monday',
  tue: 'Tuesday', tues: 'Tuesday', tuesday: 'Tuesday', tuesdays: 'Tuesday', sel: 'Tuesday', selasa: 'Tuesday',
  wed: 'Wednesday', weds: 'Wednesday', wednesday: 'Wednesday', wednesdays: 'Wednesday', rab: 'Wednesday', rabu: 'Wednesday',
  thu: 'Thursday', thur: 'Thursday', thurs: 'Thursday', thursday: 'Thursday', thursdays: 'Thursday', kam: 'Thursday', kamis: 'Thursday',
  fri: 'Friday', friday: 'Friday', fridays: 'Friday', jum: 'Friday', jumat: 'Friday', "jum'at": 'Friday',
  sat: 'Saturday', saturday: 'Saturday', saturdays: 'Saturday', sab: 'Saturday', sabtu: 'Saturday',
  sun: 'Sunday', sunday: 'Sunday', sundays: 'Sunday', min: 'Sunday', minggu: 'Sunday',
};

function parsePreferredDays(value: string): Weekday[] {
  if (!value.trim()) return [];
  const selected = new Set<Weekday>();
  for (const part of value.split(/[,;/|]+/)) {
    const key = part.trim().toLowerCase().replace(/\.$/, '');
    if (!key) continue;
    const mapped = WEEKDAY_ALIASES[key];
    if (mapped) selected.add(mapped);
  }
  return WEEKDAYS.filter((day) => selected.has(day));
}

function formatPreferredDays(days: readonly string[]): string {
  return WEEKDAYS.filter((day) => days.includes(day)).join(', ');
}

type CatalogVariantOption = {
  variantOptionId?: number;
  key: string;
  sku: string;
  product: string;
  productId: string;
  variantName: string;
};

type ProductCatalogNode = {
  productId: string;
  name: string;
  stockUnit?: string | null;
  stockLevels?: StockLevel[] | null;
  supplier?: string | null;
  variantOptions?: Array<{
    id?: number;
    variantName?: string | null;
    sku?: string | null;
    isActive?: boolean | null;
  }> | null;
};

function catalogProductLabel(productName: string, _variantName: string): string {
  // Product is always the catalog's parent product. Variant is displayed and
  // selected independently so one product does not appear as several products.
  return productName.trim();
}

function buildCatalogOptions(
  products: ProductCatalogNode[],
  supplierName?: string,
  options?: { fallbackToAll?: boolean },
): CatalogVariantOption[] {
  const supplierKey = String(supplierName || '').trim().toLowerCase();
  const matched = supplierKey
    ? products.filter((p) => String(p.supplier || '').trim().toLowerCase() === supplierKey)
    : [];
  // Prefer supplier-matched products; optionally fall back to full catalog for dropdowns.
  const allowFallback = options?.fallbackToAll !== false;
  const source = matched.length > 0 ? matched : allowFallback ? products : [];
  const out: CatalogVariantOption[] = [];
  const seen = new Set<string>();

  for (const product of source) {
    const productId = String(product.productId || '').trim();
    const productName = String(product.name || '').trim();
    if (!productId || !productName) continue;
    for (const variant of product.variantOptions || []) {
      if (variant?.isActive === false) continue;
      const variantName = String(variant?.variantName || '').trim() || 'Default';
      const sku =
        String(variant?.sku || '').trim() || `${productId}|${variantName}`;
      const key = variant?.id != null ? `variant:${variant.id}` : `${productId}|${variantName}|${sku}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        variantOptionId: variant?.id,
        key,
        sku,
        product: catalogProductLabel(productName, variantName),
        productId,
        variantName,
      });
    }
  }

  return out.sort((a, b) => a.sku.localeCompare(b.sku) || a.product.localeCompare(b.product));
}

function SupplyMatchDropdown({
  value,
  displayValue,
  placeholder,
  options,
  emptyLabel,
  noMatchLabel,
  searchPlaceholder,
  onSelect,
  renderOption,
  className = '',
  needsAttention = false,
  attentionMessage,
  disabled = false,
}: {
  value: string;
  displayValue?: string;
  placeholder: string;
  options: Array<{ value: string; label: string; optionKey: string }>;
  emptyLabel: string;
  noMatchLabel: string;
  searchPlaceholder: string;
  onSelect: (value: string) => void;
  renderOption?: (option: { value: string; label: string }) => React.ReactNode;
  className?: string;
  /** Highlight an unmatched legacy/deleted variant and explain the required action. */
  needsAttention?: boolean;
  attentionMessage?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updateMenuPos = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const menuWidth = Math.max(rect.width, 224);
    const left = Math.min(rect.left, Math.max(8, window.innerWidth - menuWidth - 8));
    setMenuPos({
      top: rect.bottom + 4,
      left,
      width: menuWidth,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    updateMenuPos();
  }, [open, updateMenuPos]);

  useEffect(() => {
    if (!open) return;
    const onReposition = () => updateMenuPos();
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
      setSearch('');
    };
    window.addEventListener('resize', onReposition);
    // Capture scroll from nested overflow containers (table wrappers, page scroller).
    document.addEventListener('scroll', onReposition, true);
    document.addEventListener('mousedown', close);
    return () => {
      window.removeEventListener('resize', onReposition);
      document.removeEventListener('scroll', onReposition, true);
      document.removeEventListener('mousedown', close);
    };
  }, [open, updateMenuPos]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (opt) =>
        opt.value.toLowerCase().includes(q) ||
        opt.label.toLowerCase().includes(q),
    );
  }, [options, search]);

  const menu =
    open && menuPos
      ? createPortal(
          <div
            ref={menuRef}
            className="fixed z-[80] rounded-lg border border-[#e6e6e6] bg-white shadow"
            style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
          >
            <div className="border-b border-[#e6e6e6] p-2">
              <div className="flex items-center gap-2 rounded-lg border border-[#e6e6e6] bg-white px-2 py-1.5">
                <Search className="h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full bg-transparent text-xs text-black outline-none placeholder:text-gray-400"
                  autoFocus
                />
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-3 py-3 text-xs text-gray-500">
                  {options.length === 0 ? emptyLabel : noMatchLabel}
                </div>
              ) : (
                filtered.map((option) => (
                  <button
                    key={option.optionKey}
                    type="button"
                    className={`block w-full px-3 py-2 text-left text-xs hover:bg-gray-100 ${
                      value === option.value ? 'font-semibold text-[#0a61d7]' : 'text-gray-700'
                    }`}
                    onClick={() => {
                      onSelect(option.value);
                      setOpen(false);
                      setSearch('');
                    }}
                  >
                    {renderOption ? renderOption(option) : option.label}
                  </button>
                ))
              )}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={`relative min-w-[10rem] ${className}`}>
      {needsAttention && attentionMessage && (
        <span className="absolute -right-2 -top-2 z-20 rounded-full bg-white shadow-sm">
          <SupplierVariantAlert message={attentionMessage} />
        </span>
      )}
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        className={`flex h-9 w-full items-center justify-between gap-1 rounded-lg border px-2 py-0 text-left text-xs text-black hover:bg-gray-100 ${
          needsAttention
            ? 'border-amber-400 bg-amber-50 ring-1 ring-amber-200'
            : 'border-[#e6e6e6] bg-white'
        }`}
        onClick={() => { if (!disabled) setOpen((next) => !next); }}
      >
        <span className={`truncate ${(value || displayValue) ? 'text-black' : needsAttention ? 'font-medium text-amber-700' : 'text-gray-500'}`}>
          {displayValue || value || placeholder}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 ${needsAttention ? 'text-amber-600' : 'text-gray-400'}`} />
      </button>
      {menu}
    </div>
  );
}

/** A saved receipt whose original VariantOption was deleted from the catalog. */
function isDeletedVariantReceipt(row: SupplyDetail): boolean {
  return Boolean(String(row.suppliesno || '').trim()) &&
    row.variantOptionId == null &&
    row.historicalVariantOptionId != null;
}

/** Older saved receipt with labels but no durable live or historical variant ID. */
function isLegacyUnlinkedReceipt(row: SupplyDetail): boolean {
  return Boolean(String(row.suppliesno || '').trim()) &&
    row.variantOptionId == null &&
    row.historicalVariantOptionId == null &&
    !isBlankHistoryRow(row);
}

/** Compact explanation for legacy/deleted variant receipts; no persistent row-height expansion. */
function SupplierVariantAlert({ message }: { message: string }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const showTooltip = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect || typeof window === 'undefined') return;
    const width = 288;
    setPosition({
      left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      top: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - 116)),
    });
    setOpen(true);
  };

  const tooltip = open && position && typeof document !== 'undefined'
    ? createPortal(
        <div
          role="tooltip"
          className="pointer-events-none fixed z-[120] w-72 rounded-lg border border-amber-200 bg-white px-3 py-2.5 text-left text-xs font-normal leading-5 text-gray-700 shadow-xl"
          style={{ left: position.left, top: position.top }}
        >
          <span className="mb-1 block text-[11px] font-semibold text-amber-800">Supply variant needs attention</span>
          {message}
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Supply variant information"
        title={message}
        onMouseEnter={showTooltip}
        onMouseLeave={() => setOpen(false)}
        onFocus={showTooltip}
        onBlur={() => setOpen(false)}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-amber-600 outline-none hover:bg-amber-50 focus-visible:ring-2 focus-visible:ring-amber-400"
      >
        <AlertCircle className="h-4 w-4" />
      </button>
      {tooltip}
    </>
  );
}

function generateSupplierId() {
  return 'LKS-' + Math.floor(10000000 + Math.random() * 90000000).toString();
}

function emptyHistoryRow(): SupplyDetail {
  return {
    suppliesno: '',
    sku: '',
    product: '',
    totalSupplied: '',
    receivedQuantity: '',
    receivedUnit: 'Pieces',
    totalValue: '',
    lastSuppliedDate: '',
    status: statusOptions[0],
    recordType: 'history',
    updateCurrentStock: true,
  };
}

function normalizeSupplyRow(row: SupplyDetail, recordType: 'history' | 'summary'): SupplyDetail {
  if (recordType === 'history') {
    return serializeHistorySupplyForStorage({
      ...row,
      // Preserve the supplier's original entry while totalSupplied remains canonical Pieces.
      receivedQuantity: String(row.receivedQuantity ?? row.totalSupplied ?? ''),
      receivedUnit: String(row.receivedUnit || 'Pieces'),
      status: row.status || statusOptions[0],
    });
  }
  return {
    suppliesno: row.suppliesno || '',
    sku: row.sku || '',
    product: row.product || '',
    totalSupplied: row.totalSupplied || '',
    totalValue: row.totalValue || '',
    lastSuppliedDate: row.lastSuppliedDate || '',
    status: row.status || statusOptions[0],
    recordType: 'summary',
    productId: row.productId,
    variantName: row.variantName,
  };
}

function parseSupplyBuckets(raw?: string | null): { history: SupplyDetail[]; summary: SupplyDetail[]; opening: SupplyDetail[] } {
  if (!raw) return { history: [emptyHistoryRow()], summary: [], opening: [] };
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return { history: [emptyHistoryRow()], summary: [], opening: [] };
    }
    // Backward compatibility: older saved rows used `lastDelivery`.
    // Normalize them on read, but only persist `lastSuppliedDate` going forward.
    const normalizedRows = (parsed as Array<SupplyDetail & { lastDelivery?: string }>).map((row) => {
      const { lastDelivery: legacyLastDelivery, ...rest } = row;
      return {
        ...rest,
        lastSuppliedDate: row.lastSuppliedDate || legacyLastDelivery || '',
        receivedQuantity: row.receivedQuantity == null ? String(row.totalSupplied || '') : String(row.receivedQuantity),
        receivedUnit: String(row.receivedUnit || 'Pieces'),
      } as SupplyDetail;
    });
    const { history, summary } = partitionSupplies(normalizedRows.filter((row) => !row.archivedAt));
    return {
      history: history.length > 0
        ? ensureUniqueHistoryIds(history.map((row) => normalizeSupplyRow(row, 'history')))
        : [emptyHistoryRow()],
      summary: buildSupplySummaryFromHistory(history, summary).map((row) => normalizeSupplyRow(row, 'summary')),
      opening: summary.map((row) => normalizeSupplyRow(row, 'summary')),
    };
  } catch {
    return { history: [emptyHistoryRow()], summary: [], opening: [] };
  }
}

function isBlankHistoryRow(row: SupplyDetail): boolean {
  return !(
    String(row.sku || '').trim() ||
    String(row.product || '').trim() ||
    String(row.totalSupplied || '').trim() ||
    String(row.totalValue || '').trim() ||
    String(row.lastSuppliedDate || '').trim()
  );
}

function stableHistoryId(row: SupplyDetail, index: number): string {
  const seed = [
    String(row.sku || '').trim(),
    String(row.productId || '').trim(),
    String(row.variantName || '').trim(),
    String(row.product || '').trim(),
    String(row.lastSuppliedDate || '').trim(),
    String(row.totalSupplied || '').trim(),
    String(row.totalValue || '').trim(),
    String(index),
  ].join('|');
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return `HIST-S${hash.toString(36)}`;
}

/** Fresh random history id that is not in `taken` (and is added to it). */
function newHistoryId(taken: Set<string>): string {
  let id = '';
  do {
    id = `HIST-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  } while (taken.has(id));
  taken.add(id);
  return id;
}

/**
 * Give every history row its own suppliesno.
 * - Saved ids are kept (first row wins when older imports wrote the same id twice).
 * - Blank ids prefer a content-stable id so legacy rows do not look "new" on every save.
 * - Anything that would collide gets a fresh random id.
 */
function ensureUniqueHistoryIds(rows: SupplyDetail[]): SupplyDetail[] {
  const taken = new Set<string>();
  // Claim saved ids first so a generated id can never displace one.
  const savedIds = rows.map((row) => {
    const id = String(row.suppliesno || '').trim();
    if (!id || taken.has(id)) return '';
    taken.add(id);
    return id;
  });
  return rows.map((row, index) => {
    let id = savedIds[index];
    if (!id) {
      const stable = String(row.suppliesno || '').trim() ? '' : stableHistoryId(row, index);
      if (stable && !taken.has(stable)) {
        taken.add(stable);
        id = stable;
      } else {
        id = newHistoryId(taken);
      }
    }
    return { ...row, suppliesno: id, recordType: 'history' };
  });
}

interface SupplierModalProps {
  initialData?: Supplier;
  mode?: 'edit' | 'add';
  onSave?: (data: SupplierFormData) => void;
}

export default function SupplierModal({ initialData, mode = 'add', onSave }: SupplierModalProps) {
  const router = useRouter();
  const user = useUserStore(state => state.user);
  const { tSuppliersModal, tSuppliersProfile, tShared, tImport, translateStatus } = useClientsTranslations();
  const isEditMode = mode === 'edit';

  // Get currency for display - safe to use on both server and client
  const userCurrency = user?.currency || getDefaultCurrency();
  const currencySymbol = getCurrencySymbol(userCurrency);
  
  // Helper function to safely parse JSON strings (moved to top to fix initialization error)
  const safeParseJSON = useCallback((jsonStr: string, fallback: unknown) => {
    if (!jsonStr) return fallback;
    try {
      return JSON.parse(jsonStr);
    } catch {
      return fallback;
    }
  }, []);
  
  const [form, setForm] = useState(() => {
    if (!initialData) {
      return {
        supplierName: '', contact: '', phone: '', email: '', businessType: '', address: '', 
        status: statusOptions[0], createdAt: new Date().toISOString().split('T')[0], preferredDays: '', lastSuppliedDate: '', 
        deliverySuccess: '', notes: '',
      };
    }
    
    // Parse JSON strings from database
    const parsedNotes = safeParseJSON(initialData.notes || '', []);
    const parsedLogistics = safeParseJSON(initialData.logistics || '', {});
    
    return {
      supplierName: initialData.name && !initialData.name.includes('Missing') ? initialData.name : '',
      contact: initialData.contact && !initialData.contact.includes('Missing') ? initialData.contact : '',
      phone: initialData.phone && !initialData.phone.includes('Missing') ? initialData.phone : '',
      email: initialData.email && !initialData.email.includes('Missing') ? initialData.email : '',
      businessType: initialData.businessType && !initialData.businessType.includes('Missing') ? initialData.businessType : '',
      address: initialData.address && !initialData.address.includes('Missing') ? initialData.address : '',
      status: initialData.status || statusOptions[0],
      createdAt: initialData.createdAt ? new Date(initialData.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      preferredDays: parsedLogistics.preferredDays && !parsedLogistics.preferredDays.includes('Missing') ? parsedLogistics.preferredDays : '',
      lastSuppliedDate: (parsedLogistics.lastSuppliedDate || parsedLogistics.lastDelivery) && !(parsedLogistics.lastSuppliedDate || parsedLogistics.lastDelivery).includes('Missing') ? (parsedLogistics.lastSuppliedDate || parsedLogistics.lastDelivery) : '',
      deliverySuccess: parsedLogistics.deliverySuccess && !parsedLogistics.deliverySuccess.includes('Missing') ? parsedLogistics.deliverySuccess : '',
      notes: Array.isArray(parsedNotes) ? parsedNotes.join(', ') : '',
    };
  });
  
  const [id, setId] = useState(() => initialData?.supplierId || generateSupplierId());
  const [summaryRows, setSummaryRows] = useState<SupplyDetail[]>(
    () => parseSupplyBuckets(initialData?.supplies).summary,
  );
  const [historyRows, setHistoryRows] = useState<SupplyDetail[]>(
    () => parseSupplyBuckets(initialData?.supplies).history,
  );
  // Supplier editing now has a single receipt-history view; legacy opening rows
  // are retained only for the Archived Supplies cleanup dialog.
  // The editor now exposes receipts only. Keep the union return type for
  // retained legacy cleanup branches so TypeScript does not compare impossible
  // literal states while those records remain available for migration/cleanup.
  const getSuppliesTab = (): 'summary' | 'opening' | 'history' => 'history';
  const suppliesTab = getSuppliesTab();
  const [showArchivedSupplies, setShowArchivedSupplies] = useState(false);
  const [archivedOpeningRows, setArchivedOpeningRows] = useState<SupplyDetail[]>(() => {
    try { return (JSON.parse(initialData?.supplies || '[]') as SupplyDetail[]).filter((row) => !!row.archivedAt); }
    catch { return []; }
  });
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [selectedArchivedRows, setSelectedArchivedRows] = useState<Set<string>>(new Set());
  const [archivedPage, setArchivedPage] = useState(1);
  const archivedPageSize = 5;
  const archivedTotalPages = Math.max(1, Math.ceil(archivedOpeningRows.length / archivedPageSize));
  const safeArchivedPage = Math.min(archivedPage, archivedTotalPages);
  const archivedPageStart = (safeArchivedPage - 1) * archivedPageSize;
  const archivedPageRows = archivedOpeningRows.slice(archivedPageStart, archivedPageStart + archivedPageSize);
  const [selectedOpeningRows, setSelectedOpeningRows] = useState<Set<string>>(new Set());
  const [openingAction, setOpeningAction] = useState<{ kind: "archive" | "restore" | "delete"; rows: SupplyDetail[] } | null>(null);
  const [openingRows, setOpeningRows] = useState<SupplyDetail[]>(() => parseSupplyBuckets(initialData?.supplies).opening);
  // Receipts whose original live variant was deleted remain in history until the
  // user explicitly archives or deletes them. A replacement with the same SKU is
  // never treated as the same variant.
  const orphanedHistoryRows = historyRows.filter((row) =>
    row.recordType === 'history' &&
    row.variantOptionId == null &&
    row.historicalVariantOptionId != null,
  );
  useEffect(() => {
    setSummaryRows(buildSupplySummaryFromHistory(historyRows.filter((item) => !isBlankHistoryRow(item)), openingRows));
  }, [openingRows, historyRows]);
  const displayedSummaryRows = suppliesTab === 'opening' ? openingRows : summaryRows;
  // Summary and history have independent pagination so switching tabs preserves each view.
  const supplyRowsPerPage = 8;
  const [summaryPage, setSummaryPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const totalSummaryPages = Math.max(1, Math.ceil(displayedSummaryRows.length / supplyRowsPerPage));
  const totalHistoryPages = Math.max(1, Math.ceil(historyRows.length / supplyRowsPerPage));
  const safeSummaryPage = Math.min(summaryPage, totalSummaryPages);
  const safeHistoryPage = Math.min(historyPage, totalHistoryPages);
  const summaryPageStart = (safeSummaryPage - 1) * supplyRowsPerPage;
  const summaryPageEnd = Math.min(summaryPageStart + supplyRowsPerPage, displayedSummaryRows.length);
  const historyPageStart = (safeHistoryPage - 1) * supplyRowsPerPage;
  const historyPageEnd = Math.min(historyPageStart + supplyRowsPerPage, historyRows.length);

  useEffect(() => {
    if (summaryPage !== safeSummaryPage) setSummaryPage(safeSummaryPage);
  }, [summaryPage, safeSummaryPage]);
  useEffect(() => {
    if (historyPage !== safeHistoryPage) setHistoryPage(safeHistoryPage);
  }, [historyPage, safeHistoryPage]);

  const [showImportSupplies, setShowImportSupplies] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState<ProductCatalogNode[]>([]);
  const [catalogLoadStatus, setCatalogLoadStatus] = useState<'loading' | 'loaded' | 'error'>('loading');

  // Supply summaries are stored in canonical Pieces regardless of the legacy stockUnit label.
  const getSupplyUnit = useCallback((_row: SupplyDetail) => 'Pieces', []);
  const getSupplyStockLevels = useCallback((row: SupplyDetail): StockLevel[] => {
    const productId = String(row.productId || '').trim();
    const sku = String(row.sku || '').trim();
    const product = catalogProducts.find((item) => productId && item.productId === productId)
      || catalogProducts.find((item) => sku && item.variantOptions?.some((variant) => variant.sku === sku));
    return getSupplyUnitOptions(product?.stockLevels);
  }, [catalogProducts]);

  const handleReceivedQuantityChange = useCallback((idx: number, receivedQuantity: string) => {
    setHistoryRows((rows) => rows.map((row, index) => {
      if (index !== idx) return row;
      const receivedUnit = row.receivedUnit || 'Pieces';
      const totalSupplied = convertSupplyQuantityToPieces(receivedQuantity, receivedUnit, getSupplyStockLevels(row));
      return { ...row, receivedQuantity, totalSupplied: totalSupplied == null ? '' : String(totalSupplied), recordType: 'history' };
    }));
  }, [getSupplyStockLevels]);

  const handleReceivedUnitChange = useCallback((idx: number, receivedUnit: string) => {
    setHistoryRows((rows) => rows.map((row, index) => {
      if (index !== idx) return row;
      const totalSupplied = convertSupplyQuantityToPieces(row.receivedQuantity ?? row.totalSupplied, receivedUnit, getSupplyStockLevels(row));
      return { ...row, receivedUnit, totalSupplied: totalSupplied == null ? '' : String(totalSupplied), recordType: 'history' };
    }));
  }, [getSupplyStockLevels]);
  const [pendingDeleteMarkers, setPendingDeleteMarkers] = useState<SupplyDeleteMarker[]>([]);
  const [showDeleteHistoryModal, setShowDeleteHistoryModal] = useState(false);
  // Row indices awaiting delete confirmation: one for the row trash, many for bulk delete.
  const [deleteHistoryIndices, setDeleteHistoryIndices] = useState<number[]>([]);
  const [deleteUpdateStock, setDeleteUpdateStock] = useState(false);
  const [selectedHistoryRows, setSelectedHistoryRows] = useState<Set<number>>(new Set());

  // Enhanced state management with proper typing
  const [saving, setSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showPreferredDaysDropdown, setShowPreferredDaysDropdown] = useState(false);
  
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const preferredDaysDropdownRef = useRef<HTMLDivElement>(null);

  const selectedPreferredDays = useMemo(
    () => parsePreferredDays(form.preferredDays || ''),
    [form.preferredDays],
  );

  const translateWeekday = useCallback(
    (day: Weekday) => {
      const key = `days.${day}`;
      if (typeof tSuppliersModal.has === 'function') {
        return tSuppliersModal.has(key) ? tSuppliersModal(key) : day;
      }
      return tSuppliersModal(key);
    },
    [tSuppliersModal],
  );

  const togglePreferredDay = useCallback((day: Weekday) => {
    setForm((current) => {
      const selected = parsePreferredDays(current.preferredDays || '');
      const next = selected.includes(day)
        ? selected.filter((row) => row !== day)
        : [...selected, day];
      return { ...current, preferredDays: formatPreferredDays(next) };
    });
  }, []);

  // Function to get the latest supplied date
  const getLatestSuppliedDate = useCallback((rows: SupplyDetail[]) => {
    if (!rows || rows.length === 0) return '';
    const dates = rows
      .map((row) => row.lastSuppliedDate)
      .filter((date): date is string => typeof date === 'string' && date.trim() !== '')
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    return dates[0] ?? '';
  }, []);

  // Compute lastSuppliedDate during render (not in useEffect) - follows React best practices
  // Use computed value directly instead of storing in state
  const computedLastSuppliedDate = useMemo(() => {
    return getLatestSuppliedDate(historyRows);
  }, [historyRows, getLatestSuppliedDate]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setShowStatusDropdown(false);
      }
      if (preferredDaysDropdownRef.current && !preferredDaysDropdownRef.current.contains(event.target as Node)) {
        setShowPreferredDaysDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Enhanced form validation
  // Client-side validation - no required fields
  const validateForm = useCallback(() => {
    const errors: Record<string, string> = {};

    const supplierNameResult = validateRequiredField(form.supplierName, tSuppliersModal('supplierName'));
    const contactResult = validateRequiredField(form.contact, tSuppliersModal('contactPerson'));
    const phoneResult = validateRequiredPhone(form.phone);
    const emailResult = validateOptionalEmail(form.email);
    const addressResult = validateRequiredField(form.address, tSuppliersModal('address'));

    if (!supplierNameResult.valid && supplierNameResult.error) errors.supplierName = supplierNameResult.error;
    if (!contactResult.valid && contactResult.error) errors.contact = contactResult.error;
    if (!phoneResult.valid && phoneResult.error) errors.phone = phoneResult.error;
    if (!emailResult.valid && emailResult.error) errors.email = emailResult.error;
    if (!addressResult.valid && addressResult.error) errors.address = addressResult.error;

    setValidationErrors(errors);
    setSubmitAttempted(true);
    return Object.keys(errors).length === 0;
  }, [form.supplierName, form.contact, form.phone, form.email, form.address, tSuppliersModal]);

  // Enhanced error handling
  const handleError = useCallback((message: string) => {
    setError(message);
    setSuccess('');
    // Auto-hide error after 5 seconds
    setTimeout(() => setError(''), 5000);
  }, []);

  // Enhanced success handling
  const handleSuccess = useCallback((message: string) => {
    setSuccess(message);
    setError('');
    // Auto-hide success after 3 seconds
    setTimeout(() => setSuccess(''), 3000);
  }, []);

  // Load catalog variants for SKU ↔ product match dropdowns (all pages).
  useEffect(() => {
    if (!user?.id) return;
    setCatalogLoadStatus('loading');
    let cancelled = false;
    (async () => {
      try {
        const pageSize = 1000; // server caps at MAX_PRODUCT_LIMIT
        let page = 1;
        let totalPages = 1;
        const all: ProductCatalogNode[] = [];
        do {
          const data = await fetchGraphQL<{
            products: {
              nodes: ProductCatalogNode[];
              pagination: { totalPages?: number };
            };
          }>(
            `query SupplierSupplyCatalog($userId: Int!, $page: Int!, $limit: Int!) {
              products(userId: $userId, page: $page, limit: $limit) {
                nodes {
                  productId
                  name
                  stockUnit
                  stockLevels
                  supplier
                  variantOptions { id variantName sku isActive }
                }
                pagination { totalPages }
              }
            }`,
            { userId: user.id, page, limit: pageSize },
          );
          all.push(...(data.products?.nodes || []));
          totalPages = Math.max(1, data.products?.pagination?.totalPages ?? 1);
          page += 1;
        } while (!cancelled && page <= totalPages);
        if (!cancelled) {
          setCatalogProducts(all);
          setCatalogLoadStatus('loaded');
        }
      } catch {
        if (!cancelled) {
          setCatalogProducts([]);
          setCatalogLoadStatus('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Only live catalog variants are selectable. Historical rows retain their
  // own frozen SKU/product/variant labels; do not reinsert deleted variants as
  // fake catalog options (which could accidentally re-link a recreated SKU).
  const catalogOptions = useMemo(
    () => buildCatalogOptions(catalogProducts, form.supplierName || initialData?.name),
    [catalogProducts, form.supplierName, initialData?.name],
  );

  // A replacement variant may have the same product/variant identity but a new
  // VariantOption ID. In that case the receipt should be relinked, not archived.
  const hasMatchingLiveVariant = useCallback((row: SupplyDetail) => {
    const normalize = (value: unknown) => String(value || '').trim().toLocaleLowerCase();
    const productId = normalize(row.productId);
    const productName = normalize(row.product);
    const sku = normalize(row.sku);
    const variantName = normalize(row.variantName);
    return catalogOptions.some((option) => {
      const sameProduct =
        (productId && normalize(option.productId) === productId) ||
        (productName && normalize(option.product) === productName);
      if (!sameProduct) return false;
      return Boolean(
        (sku && normalize(option.sku) === sku) ||
        (variantName && normalize(option.variantName) === variantName),
      );
    });
  }, [catalogOptions]);

  /** Strict ownership list for import validation — no full-catalog fallback. */
  const supplierOwnedCatalog = useMemo(
    () =>
      buildCatalogOptions(catalogProducts, form.supplierName || initialData?.name, {
        fallbackToAll: false,
      }).map((opt) => {
        const product = catalogProducts.find((item) => item.productId === opt.productId);
        const variant = product?.variantOptions?.find((item) => String(item.variantName || '').trim() === opt.variantName);
        return { variantOptionId: variant?.id, sku: opt.sku, product: opt.product, productId: opt.productId, variantName: opt.variantName, stockLevels: product?.stockLevels || [] };
      }),
    [catalogProducts, form.supplierName, initialData?.name],
  );

  const skuDropdownOptions = useMemo(
    () => catalogOptions.map((opt) => ({
      optionKey: opt.key,
      // SKU is a display label, never a selection key: multiple variants
      // legitimately share a SKU.
      value: String(opt.variantOptionId ?? opt.key),
      label: `${opt.sku} · ${opt.product} · ${opt.variantName}`,
    })),
    [catalogOptions],
  );

  const productDropdownOptions = useMemo(() => {
    const byProductId = new Map<string, { optionKey: string; value: string; label: string }>();
    for (const opt of catalogOptions) {
      if (!byProductId.has(opt.productId)) {
        byProductId.set(opt.productId, {
          optionKey: `product:${opt.productId}`,
          value: opt.productId,
          label: opt.product,
        });
      }
    }
    return Array.from(byProductId.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [catalogOptions]);

  // History rows only — summary is read-only on the edit page
  const handleHistoryChange = useCallback((idx: number, field: keyof SupplyDetail, value: string) => {
    setHistoryRows((rows) =>
      rows.map((row, i) => (i === idx ? { ...row, [field]: value, recordType: 'history' } : row)),
    );
  }, []);

  const handleHistoryVariantSelect = useCallback((idx: number, variantId: string) => {
    const match = catalogOptions.find((opt) => opt.variantOptionId != null && String(opt.variantOptionId) === variantId);
    if (!match) return;
    setHistoryRows((rows) => rows.map((row, i) => i === idx && !isDeletedVariantReceipt(row) ? {
      ...row,
      sku: match.sku,
      product: match.product,
      productId: match.productId,
      variantName: match.variantName,
      variantOptionId: match.variantOptionId,
      recordType: 'history',
    } : row));
  }, [catalogOptions]);

  const handleHistoryProductSelect = useCallback(
    (idx: number, productId: string) => {
      const matches = catalogOptions.filter((opt) => opt.productId === productId);
      setHistoryRows((rows) => rows.map((row, i) => {
        if (i !== idx || isDeletedVariantReceipt(row)) return row;
        const identified = matches.find((item) => item.variantName === row.variantName)
          || (matches.length === 1 ? matches[0] : undefined);
        const productName = matches[0]?.product || row.product;
        return {
          ...row,
          product: productName,
          productId,
          sku: identified?.sku || '',
          variantOptionId: identified?.variantOptionId ?? null,
          variantName: identified?.variantName || '',
          receivedUnit: 'Pieces',
          totalSupplied: String(row.receivedQuantity ?? row.totalSupplied ?? ''),
          updateCurrentStock: identified ? row.updateCurrentStock === true : false,
          recordType: 'history',
        };
      }));
    },
    [catalogOptions],
  );

  const addHistoryRow = useCallback(() => {
    setHistoryRows((rows) => [...rows, emptyHistoryRow()]);
    setHistoryPage(Math.max(1, Math.ceil((historyRows.length + 1) / supplyRowsPerPage)));
  }, [historyRows.length]);

  const allHistoryRowsSelected = historyRows.length > 0 && selectedHistoryRows.size === historyRows.length;
  const someHistoryRowsSelected = selectedHistoryRows.size > 0 && !allHistoryRowsSelected;
  const selectedHistoryRowIndices = [...selectedHistoryRows].filter((index) => {
    const row = historyRows[index];
    return Boolean(row) && !isBlankHistoryRow(row);
  });
  const selectedHistoryRecords = selectedHistoryRowIndices
    .map((index) => historyRows[index])
    .filter((row): row is SupplyDetail => Boolean(row));
  const canBulkUpdateStock = selectedHistoryRecords.length > 0 &&
    selectedHistoryRecords.every((row) => row.updateCurrentStock !== true);
  const canBulkUnupdateStock = selectedHistoryRecords.length > 0 &&
    selectedHistoryRecords.every((row) => row.updateCurrentStock === true);
  const canArchiveHistoryRow = (row: SupplyDetail) =>
    isEditMode && Boolean(String(row.suppliesno || '').trim()) &&
    row.variantOptionId == null &&
    (isDeletedVariantReceipt(row) || isLegacyUnlinkedReceipt(row));
  const canBulkArchiveHistory = selectedHistoryRecords.length > 0 &&
    selectedHistoryRecords.every(canArchiveHistoryRow);

  const toggleHistoryRowSelection = useCallback((idx: number) => {
    setSelectedHistoryRows((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const toggleAllHistoryRowSelection = useCallback(() => {
    setSelectedHistoryRows(
      allHistoryRowsSelected ? new Set() : new Set(historyRows.map((_, i) => i)),
    );
  }, [allHistoryRowsSelected, historyRows]);

  const handleBulkUpdateStock = useCallback(() => {
    setHistoryRows((rows) =>
      rows.map((r, i) =>
        selectedHistoryRowIndices.includes(i)
          ? {
              ...r,
              updateCurrentStock: true,
              // Same rule as the row checkbox: only the server sets stockApplied.
              stockApplied: r.stockApplied === true,
              recordType: 'history',
            }
          : r,
      ),
    );
    setSelectedHistoryRows(new Set());
  }, [selectedHistoryRowIndices]);

  const handleBulkUnupdateStock = useCallback(() => {
    setHistoryRows((rows) =>
      rows.map((r, i) =>
        selectedHistoryRowIndices.includes(i)
          ? {
              ...r,
              updateCurrentStock: false,
              // Keep the server-owned applied flag unchanged. The normal save path
              // handles any required stock reversal from the persisted state.
              stockApplied: r.stockApplied === true,
              recordType: 'history',
            }
          : r,
      ),
    );
    setSelectedHistoryRows(new Set());
  }, [selectedHistoryRows]);

  const removeHistoryRows = useCallback((indices: number[]) => {
    const doomed = new Set(indices);
    setHistoryRows((rows) => {
      const remaining = rows.filter((_, i) => !doomed.has(i));
      return remaining.length > 0 ? remaining : [emptyHistoryRow()];
    });
    // Row indices shift after a delete, so any selection is stale.
    setSelectedHistoryRows(new Set());
  }, []);

  const openDeleteHistoryModal = useCallback((indices: number[]) => {
    const targets = indices.filter((i) => historyRows[i]);
    if (targets.length === 0) return;
    // Blank rows were never saved, so there is nothing to confirm or reverse.
    if (targets.every((i) => isBlankHistoryRow(historyRows[i]))) {
      removeHistoryRows(targets);
      return;
    }
    setDeleteHistoryIndices(targets);
    // Default unchecked so stock is preserved unless the user opts in.
    setDeleteUpdateStock(false);
    setShowDeleteHistoryModal(true);
  }, [historyRows, removeHistoryRows]);

  const handleDeleteHistoryCancel = useCallback(() => {
    setShowDeleteHistoryModal(false);
    setDeleteHistoryIndices([]);
    setDeleteUpdateStock(false);
  }, []);

  const handleDeleteHistoryConfirm = useCallback(() => {
    if (deleteHistoryIndices.length === 0) return;
    const markers = deleteHistoryIndices
      .map((i) => historyRows[i])
      .filter((row) => row && !isBlankHistoryRow(row))
      .map((row): SupplyDeleteMarker => ({
        ...normalizeSupplyRow(row, 'history'),
        __delete: true,
        updateCurrentStock: deleteUpdateStock,
      }));
    if (markers.length > 0) {
      setPendingDeleteMarkers((prev) => [...prev, ...markers]);
    }
    removeHistoryRows(deleteHistoryIndices);
    setShowDeleteHistoryModal(false);
    setDeleteHistoryIndices([]);
    setDeleteUpdateStock(false);
  }, [deleteHistoryIndices, deleteUpdateStock, historyRows, removeHistoryRows]);

  const handleExportHistory = useCallback(() => {
    const exportRows = historyRows.filter((row) => !isBlankHistoryRow(row));
    const headers = ['Product', 'SKU', 'Variant', 'Received Quantity', 'Stock Type', 'Purchase Value', 'Last Supplied Date', 'Update Stock'];
    const rows = exportRows.map((row) => {
      const matched = catalogOptions.find((option) => option.sku === row.sku);
      return [
        matched?.product || row.product || '',
        row.sku || '',
        row.variantName || matched?.variantName || '',
        row.receivedQuantity ?? row.totalSupplied ?? '',
        row.receivedUnit || 'Pieces',
        row.totalValue || '',
        row.lastSuppliedDate || '',
        row.updateCurrentStock === true ? 'Yes' : 'No',
      ];
    });
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Supply History');
    XLSX.writeFile(wb, `${form.supplierName || id || 'supplier'}-supply-history.xlsx`);
  }, [historyRows, catalogOptions, form.supplierName, id]);

  const handleImportHistory = useCallback((newSupplies: SupplyDetail[]) => {
    // Every imported row is a new supply event: always a fresh id, never one already
    // used by a row in the table or by a row deleted in this session.
    const taken = new Set(
      [...historyRows, ...pendingDeleteMarkers]
        .map((row) => String(row.suppliesno || '').trim())
        .filter(Boolean),
    );
    const imported = newSupplies.map((row): SupplyDetail => ({
      ...normalizeSupplyRow(row, 'history'),
      suppliesno: newHistoryId(taken),
      // Imports are historical by default — totals only, no product stock change.
      updateCurrentStock: false,
    }));
    setHistoryRows((rows) => {
      const existing = rows.filter((row) => !isBlankHistoryRow(row));
      return existing.length > 0 ? [...existing, ...imported] : imported.length > 0 ? imported : [emptyHistoryRow()];
    });
    const existingCount = historyRows.filter((row) => !isBlankHistoryRow(row)).length;
    if (imported.length > 0) {
      setHistoryPage(Math.max(1, Math.ceil((existingCount + imported.length) / supplyRowsPerPage)));
    }
    // Blank rows are dropped on import, which shifts indices.
    setSelectedHistoryRows(new Set());
    setShowImportSupplies(false);
  }, [historyRows, pendingDeleteMarkers]);

  // Hydrate form when initialData is provided (edit)
  useEffect(() => {
    if (!initialData || !isEditMode) return;

    const parsedNotes = safeParseJSON(initialData.notes || '', []);
    const parsedLogistics = safeParseJSON(initialData.logistics || '', {});

    const buckets = parseSupplyBuckets(initialData.supplies);
    const latestSuppliedDate = getLatestSuppliedDate(buckets.history);

    setForm({
      supplierName: initialData.name || '',
      contact: initialData.contact || '',
      phone: initialData.phone || '',
      email: initialData.email || '',
      businessType: initialData.businessType || '',
      address: initialData.address || '',
      status: initialData.status || statusOptions[0],
      createdAt: initialData.createdAt ? new Date(initialData.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      preferredDays: parsedLogistics.preferredDays || '',
      lastSuppliedDate: latestSuppliedDate || parsedLogistics.lastSuppliedDate || parsedLogistics.lastDelivery || '',
      deliverySuccess: parsedLogistics.deliverySuccess || '',
      notes: Array.isArray(parsedNotes) ? parsedNotes.join(', ') : '',
    });

    setId(initialData.supplierId || generateSupplierId());
    setSummaryRows(buckets.summary);
    setOpeningRows(buckets.opening);
    try { setArchivedOpeningRows((JSON.parse(initialData.supplies || '[]') as SupplyDetail[]).filter((row) => !!row.archivedAt)); }
    catch { setArchivedOpeningRows([]); }
    setHistoryRows(buckets.history);
    setSelectedHistoryRows(new Set());
    setPendingDeleteMarkers([]);
    setShowDeleteHistoryModal(false);
    setDeleteHistoryIndices([]);
    setDeleteUpdateStock(false);
    setValidationErrors({});
    setError('');
    setSuccess('');
    setSubmitAttempted(false);
  }, [initialData, isEditMode, safeParseJSON, getLatestSuppliedDate]);

  const setOpeningArchive = async (row: SupplyDetail, archived: boolean) => {
    if (!isEditMode || !user?.id || !initialData?.supplierId || archiveBusy) return;
    setArchiveBusy(true);
    setError('');
    try {
      await fetchGraphQL<{ setOpeningBalanceArchived: boolean }>(
        `mutation SetOpeningArchive($userId: Int!, $supplierId: String!, $suppliesno: String!, $archived: Boolean!) {
          setOpeningBalanceArchived(userId: $userId, supplierId: $supplierId, suppliesno: $suppliesno, archived: $archived)
        }`,
        { userId: user.id, supplierId: initialData.supplierId, suppliesno: row.suppliesno, archived },
      );
      if (row.recordType === 'history') {
        setHistoryRows((current) => archived
          ? current.filter((item) => item.suppliesno !== row.suppliesno)
          : [...current.filter((item) => item.suppliesno !== row.suppliesno), { ...row, archivedAt: null }]);
      } else {
        setOpeningRows((current) => archived
          ? current.filter((item) => item.suppliesno !== row.suppliesno)
          : [...current.filter((item) => item.suppliesno !== row.suppliesno), { ...row, archivedAt: null }]);
      }
      setArchivedOpeningRows((rows) => archived
        ? [...rows.filter((item) => item.suppliesno !== row.suppliesno), { ...row, archivedAt: new Date().toISOString() }]
        : rows.filter((item) => item.suppliesno !== row.suppliesno));
      setSummaryPage(1);
      setSelectedOpeningRows((prev) => { const next = new Set(prev); next.delete(row.suppliesno); return next; });
      setSuccess(archived ? 'Supply archived.' : 'Supply restored.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to change archive status');
    } finally { setArchiveBusy(false); }
  };

  const deleteOpening = async (row: SupplyDetail) => {
    if (!isEditMode || !user?.id || !initialData?.supplierId || archiveBusy) return;
    setArchiveBusy(true);
    setError('');
    try {
      await fetchGraphQL<{ deleteArchivedOpeningBalance: boolean }>(
        `mutation DeleteArchivedOpening($userId: Int!, $supplierId: String!, $suppliesno: String!) {
          deleteArchivedOpeningBalance(userId: $userId, supplierId: $supplierId, suppliesno: $suppliesno)
        }`,
        { userId: user.id, supplierId: initialData.supplierId, suppliesno: row.suppliesno },
      );
      setOpeningRows((current) => current.filter((item) => item.suppliesno !== row.suppliesno));
      setHistoryRows((current) => current.filter((item) => item.suppliesno !== row.suppliesno));
      setArchivedOpeningRows((rows) => rows.filter((item) => item.suppliesno !== row.suppliesno));
      setSelectedOpeningRows((prev) => { const nextSelected = new Set(prev); nextSelected.delete(row.suppliesno); return nextSelected; });

      setSummaryPage(1);
      setSuccess('Supply deleted. Other receipt history was preserved.');
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to delete opening balance'); }
    finally { setArchiveBusy(false); }
  };

  const performOpeningAction = async () => {
    if (!openingAction) return;
    const { kind, rows } = openingAction;
    setOpeningAction(null);
    // Each operation manages its own busy/error state. Keep the remaining
    // records available for retry if an individual mutation fails.
    for (const row of rows) {
      if (kind === 'delete') await deleteOpening(row);
      else await setOpeningArchive(row, kind === 'archive');
    }
    // Archiving/deleting history rows changes their indices in the table.
    setSelectedHistoryRows(new Set());
    setSelectedOpeningRows(new Set());
  };

  // Enhanced form submission
  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    if (isSubmitting || isNavigating) return;

    setError('');
    setSuccess('');

    if (!validateForm()) return;

    const unresolvedStockRows = historyRows.filter((row) => {
      if (isBlankHistoryRow(row)) return false;
      // Deleted/legacy variant snapshots may remain in the table indefinitely.
      // They are historical records, not unresolved new stock operations.
      if (row.variantOptionId == null && String(row.suppliesno || '').trim()) return false;
      if (row.updateCurrentStock !== true) return false;
      const qty = Number(String(row.totalSupplied || '').replace(/[^\d.-]/g, ''));
      if (!Number.isFinite(qty) || qty <= 0) return false;
      // Snapshot labels are not an inventory target. A stock movement needs
      // the exact current VariantOption selected in the catalog dropdown.
      return row.variantOptionId == null;
    });
    if (unresolvedStockRows.length > 0) {
      handleError('Select the live catalog SKU/variant for every receipt marked Update Stock. Historical labels alone cannot identify an inventory variant.');
      return;
    }

    setIsSubmitting(true);
    setSaving(true);
    
    try {
      const cleanedHistory = ensureUniqueHistoryIds(
        historyRows
          .filter((row) => !isBlankHistoryRow(row))
          .map((row) => normalizeSupplyRow(row, 'history')),
      );
      // Archived history receipts remain stored as history records; never coerce
      // them into legacy summary rows when saving the supplier.
      const cleanedSummary = [
        ...openingRows,
        ...archivedOpeningRows.filter((row) => row.recordType === 'summary'),
      ].map((row) => normalizeSupplyRow(row, 'summary'));
      // Tombstones carry explicit reverse-stock intent from the delete modal.
      const mergedSupplies = [...cleanedSummary, ...cleanedHistory, ...pendingDeleteMarkers];

      const payload: Record<string, unknown> = {
        ...form,
        supplierId: id,
        name: form.supplierName,

        supplies: JSON.stringify(mergedSupplies),
        notes: JSON.stringify(form.notes.split(',').map((n: string) => n.trim())),
        createdAt: isEditMode ? (form.createdAt ? new Date(form.createdAt).toISOString() : new Date().toISOString()) : new Date().toISOString(),
        logistics: JSON.stringify({
          preferredDays: form.preferredDays || '',
          lastSuppliedDate: computedLastSuppliedDate || '',
          deliverySuccess: form.deliverySuccess || ''
        }),
        userId: user?.id,
      };
      if (isEditMode && initialData && typeof initialData.id === 'number') {
        payload.id = initialData.id;
      }
      delete payload.supplierName;
      delete payload.preferredDays;
      delete payload.lastSuppliedDate;
      delete payload.deliverySuccess;
      
      // Debug: Log the payload being sent
      // Supplier payload prepared for submission
      
      let savedSupplier: Supplier | null = null;
      
      if (isEditMode) {
        const UPDATE_SUPPLIER_MUTATION = `
          mutation UpdateSupplier(
            $userId: Int!
            $id: String
            $supplierId: String
            $name: String
            $contact: String
            $email: String
            $phone: String
            $businessType: String
            $address: String
            $status: String
            $logistics: String
            $notes: String
            $supplies: String
            $expectedUpdatedAt: String
          ) {
            updateSupplier(
              userId: $userId
              id: $id
              supplierId: $supplierId
              name: $name
              contact: $contact
              email: $email
              phone: $phone
              businessType: $businessType
              address: $address
              status: $status
              logistics: $logistics
              notes: $notes
              supplies: $supplies
              expectedUpdatedAt: $expectedUpdatedAt
            ) {
              id
              supplierId
              name
              contact
              email
              phone
              businessType
              address
              status
              logistics
              notes
              supplies
              avgMonthlyPurchaseValue
              totalPurchases
              totalSupplies
              onTimeDeliveryRate
              userId
              createdAt
              updatedAt
            }
          }
        `;
        
        const data = await fetchGraphQL<{ updateSupplier: Supplier }>(UPDATE_SUPPLIER_MUTATION, {
          userId: user?.id,
          id: initialData?.supplierId || initialData?.id?.toString(),
          supplierId: payload.supplierId,
          name: payload.name,
          contact: payload.contact,
          email: payload.email,
          phone: payload.phone,
          businessType: payload.businessType,
          address: payload.address,
          status: payload.status,
          logistics: payload.logistics,
          notes: payload.notes,
          supplies: payload.supplies,
      });
        
        savedSupplier = data.updateSupplier;
        onSave?.(savedSupplier as unknown as SupplierFormData);
      } else {
        const CREATE_SUPPLIER_MUTATION = `
          mutation CreateSupplier(
            $userId: Int!
            $supplierId: String
            $name: String
            $contact: String
            $email: String
            $phone: String
            $businessType: String
            $address: String
            $status: String
            $logistics: String
            $notes: String
            $supplies: String
          ) {
            createSupplier(
              userId: $userId
              supplierId: $supplierId
              name: $name
              contact: $contact
              email: $email
              phone: $phone
              businessType: $businessType
              address: $address
              status: $status
              logistics: $logistics
              notes: $notes
              supplies: $supplies
            ) {
              id
              supplierId
              name
              contact
              email
              phone
              businessType
              address
              status
              logistics
              notes
              supplies
              avgMonthlyPurchaseValue
              totalPurchases
              totalSupplies
              onTimeDeliveryRate
              userId
              createdAt
              updatedAt
            }
          }
        `;
        
        const data = await fetchGraphQL<{ createSupplier: Supplier }>(CREATE_SUPPLIER_MUTATION, {
          userId: user?.id,
          supplierId: payload.supplierId,
          name: payload.name,
          contact: payload.contact,
          email: payload.email,
          phone: payload.phone,
          businessType: payload.businessType,
          address: payload.address,
          status: payload.status,
          logistics: payload.logistics,
          notes: payload.notes,
          supplies: payload.supplies,
          expectedUpdatedAt: initialData?.updatedAt,
        });
      
        savedSupplier = data.createSupplier;
        onSave?.(savedSupplier as unknown as SupplierFormData);
      }

      const routeId = savedSupplier?.supplierId || String(payload.supplierId || '');
      setIsNavigating(true);
      setShowSuccessModal(true);
      setTimeout(() => {
        setShowSuccessModal(false);
        if (routeId) {
          router.push(`/clients/suppliers/details/${encodeURIComponent(routeId)}`);
        } else {
          router.push('/clients/suppliers');
        }
      }, 1200);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : tSuppliersModal('saveFailed');
      const field = mapSupplierFieldError(errorMessage);
      if (field) {
        setValidationErrors((prev) => ({ ...prev, [field]: errorMessage }));
        setSubmitAttempted(true);
      } else {
        handleError(errorMessage);
      }
    } finally {
      setSaving(false);
      setIsSubmitting(false);
    }
  }, [form, id, historyRows, openingRows, archivedOpeningRows, pendingDeleteMarkers, isEditMode, initialData, user?.id, onSave, router, validateForm, handleError, isSubmitting, isNavigating, tSuppliersModal, computedLastSuppliedDate]);

  return (
    <>
      <div className="flex w-full min-w-0 flex-col overflow-hidden rounded-lg border border-[#e6e6e6] bg-white p-4">
        <div className="mb-4 flex flex-col gap-3 border-b border-[#e6e6e6] pb-4 @5xl/main:flex-row @5xl/main:items-center @5xl/main:justify-between">
          <div className="flex min-w-0 flex-col gap-3 @3xl/main:flex-row @3xl/main:items-center">
            <Link
              href={isEditMode && initialData?.supplierId ? `/clients/suppliers/details/${encodeURIComponent(initialData.supplierId)}` : '/clients/suppliers'}
              className="flex w-full shrink-0 items-center justify-center gap-2 rounded-lg px-3 py-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800 @3xl/main:w-auto @3xl/main:justify-start"
            >
              <ArrowLeft className="h-4 w-4" />
              {tSuppliersModal('back')}
            </Link>
            <h1 className="truncate text-2xl font-bold text-gray-900">
              {isEditMode ? tSuppliersModal('editTitle') : tSuppliersModal('addTitle')}
            </h1>
          </div>
          <div className="flex w-full min-w-0 flex-col gap-2 @4xl/main:flex-row @4xl/main:flex-wrap @4xl/main:items-center @5xl/main:w-auto">
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0a61d7] px-4 py-2 font-semibold text-white transition-colors hover:bg-[#084ba6] disabled:cursor-not-allowed disabled:opacity-50 @4xl/main:w-auto"
              onClick={handleSubmit}
              disabled={saving || isSubmitting || isNavigating}
            >
              {saving ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  {tSuppliersModal('saving')}
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  {tSuppliersModal('save')}
                </>
              )}
            </button>
          </div>
        </div>
        <form className="flex flex-col gap-2">
          <div className="mt-0">
            <ClientField
              label={tShared('columns.id')}
              value={id || ''}
              onChange={setId}
              required
              disabled
            />
          </div>
          <ClientField
            label={tSuppliersModal('supplierName')}
            value={form.supplierName || ''}
            onChange={(supplierName) => {
              setForm((f) => ({ ...f, supplierName }));
              setValidationErrors((prev) => clearValidationField(prev, 'supplierName'));
            }}
            validator={(value) => validateRequiredField(value, tSuppliersModal('supplierName'))}
            submitAttempted={submitAttempted}
            externalError={validationErrors.supplierName}
            required
          />
          <ClientField
            label={tSuppliersModal('contactPerson')}
            value={form.contact || ''}
            onChange={(contact) => {
              setForm((f) => ({ ...f, contact }));
              setValidationErrors((prev) => clearValidationField(prev, 'contact'));
            }}
            validator={(value) => validateRequiredField(value, tSuppliersModal('contactPerson'))}
            submitAttempted={submitAttempted}
            externalError={validationErrors.contact}
            required
          />
          <div className="flex gap-2">
            <ClientValidatedField
              className="flex-1"
              label={tSuppliersModal('phone')}
              type="tel"
              value={form.phone || ''}
              onChange={(phone) => {
                setForm((f) => ({ ...f, phone }));
                setValidationErrors((prev) => clearValidationField(prev, 'phone'));
              }}
              validator={validateRequiredPhone}
              required
              submitAttempted={submitAttempted}
              externalError={validationErrors.phone}
            />
            <ClientValidatedField
              className="flex-1"
              label={tSuppliersModal('email')}
              type="email"
              value={form.email || ''}
              onChange={(email) => {
                setForm((f) => ({ ...f, email }));
                setValidationErrors((prev) => clearValidationField(prev, 'email'));
              }}
              validator={validateOptionalEmail}
              submitAttempted={submitAttempted}
              externalError={validationErrors.email}
            />
          </div>
          <div className="flex gap-2">
            <ClientField
              className="flex-1"
              label={tSuppliersModal('businessType')}
              value={form.businessType || ''}
              onChange={(businessType) => setForm((f) => ({ ...f, businessType }))}
              placeholder={tSuppliersModal('businessTypePlaceholder')}
            />
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">{tSuppliersModal('status')}</label>
              <div className="relative" ref={statusDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                  className={CLIENT_SELECT_BUTTON_CLASS}
                >
                  <span className={form.status ? 'text-black' : 'text-gray-500'}>
                    {form.status ? translateStatus(form.status) : tSuppliersModal('selectStatus')}
                  </span>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>
                {showStatusDropdown && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                    {statusOptions.map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => {
                          setForm(f => ({ ...f, status }));
                          setShowStatusDropdown(false);
                        }}
                        className={`w-full px-3 py-2 text-xs text-left hover:bg-gray-100 ${
                          form.status === status ? 'text-[#0a61d7] font-semibold bg-gray-50' : 'text-gray-700'
                        }`}
                      >
                        {translateStatus(status)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <ClientField
            label={tSuppliersModal('address')}
            value={form.address || ''}
            onChange={(address) => {
              setForm((f) => ({ ...f, address }));
              setValidationErrors((prev) => clearValidationField(prev, 'address'));
            }}
            validator={(value) => validateRequiredField(value, tSuppliersModal('address'))}
            submitAttempted={submitAttempted}
            externalError={validationErrors.address}
            required
            rows={3}
          />
          {/* Supplier and supply action feedback stays beside the affected table. */}
          {/* Success Message */}
          {success && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
              <span className="text-green-800 text-xs font-medium">{success}</span>
            </div>
          )}
          
          {/* Error Message */}
          {error && !(suppliesTab === 'opening' && isEditMode) && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <span className="text-red-800 text-xs font-medium">{error}</span>
            </div>
          )}

          {/* Supplies & Product Data — summary read-only; history editable via table + import/export */}
          <div className="my-2 border-t border-gray-200 pt-2">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <label className="block text-sm font-bold text-black">{tSuppliersModal('suppliesSection')}</label>
              
              <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="flex items-center gap-1 rounded-lg border border-[#e6e6e6] bg-white px-3 py-1.5 text-xs font-medium text-black transition hover:bg-gray-100"
                    onClick={() => setShowImportSupplies(true)}
                  >
                    <Upload className="h-3.5 w-3.5" /> {tSuppliersProfile('importSupplies')}
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-1 rounded-lg border border-[#e6e6e6] bg-white px-3 py-1.5 text-xs font-medium text-black transition hover:bg-gray-100"
                    onClick={handleExportHistory}
                  >
                    <Download className="h-3.5 w-3.5" /> {tSuppliersProfile('exportSupplies')}
                  </button>
                  <button type="button" className="rounded-lg border border-[#e6e6e6] bg-white px-3 py-1.5 text-xs font-medium text-black hover:bg-gray-100" onClick={() => setShowArchivedSupplies(true)}>Archived Supplies</button>
              </div>
            </div>

            {showImportSupplies && (
              <ImportSuppliesModal
                open={showImportSupplies}
                onCloseAction={() => setShowImportSupplies(false)}
                onImportAction={handleImportHistory}
                supplierCatalog={supplierOwnedCatalog}
              />
            )}
            {suppliesTab === 'opening' && isEditMode && error && (
              <div role="alert" className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {suppliesTab === 'opening' && isEditMode && selectedOpeningRows.size > 0 && (
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#e6e6e6] border-l-4 border-l-blue-500 bg-white p-3 shadow-sm">
                <span className="text-sm font-semibold text-gray-700">{selectedOpeningRows.size} opening balance(s) selected</span>
                <div className="flex items-center gap-2">
                  <button type="button" disabled={archiveBusy} onClick={() => setOpeningAction({kind:'archive', rows:openingRows.filter((r)=>selectedOpeningRows.has(r.suppliesno))})} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold"><Archive className="h-4 w-4"/> Archive selected</button>
                  <button type="button" disabled={archiveBusy} onClick={() => setOpeningAction({kind:'delete', rows:openingRows.filter((r)=>selectedOpeningRows.has(r.suppliesno))})} className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600"><Trash className="h-4 w-4"/> Delete selected</button>
                </div>
              </div>
            )}
            {suppliesTab === 'history' && selectedHistoryRows.size > 0 && (
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#e6e6e6] border-l-4 border-l-green-500 bg-white p-3 shadow-sm">
                <span className="text-sm font-semibold text-green-700">
                  {tSuppliersModal('historyRowsSelected', { count: selectedHistoryRows.size })}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {canBulkUpdateStock ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-lg border border-[#e6e6e6] bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-gray-50"
                      onClick={handleBulkUpdateStock}
                    >
                      {tSuppliersModal('bulkUpdateStock')}
                    </button>
                  ) : canBulkUnupdateStock ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-lg border border-[#e6e6e6] bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                      onClick={handleBulkUnupdateStock}
                      title={tSuppliersModal('bulkUnupdateStock')}
                    >
                      {tSuppliersModal('bulkUnupdateStock')}
                    </button>
                  ) : null}
                  {canBulkArchiveHistory ? (
                    <button
                      type="button"
                      disabled={archiveBusy}
                      className="inline-flex items-center gap-2 rounded-lg border border-[#e6e6e6] bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => setOpeningAction({
                        kind: 'archive',
                        rows: selectedHistoryRowIndices.map((index) => historyRows[index]).filter((row): row is SupplyDetail => Boolean(row)),
                      })}
                    >
                      <Archive className="h-4 w-4" /> Archive selected
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
                    onClick={() => openDeleteHistoryModal([...selectedHistoryRows])}
                  >
                    <Trash className="h-4 w-4" /> {tSuppliersModal('bulkDelete')}
                  </button>
                </div>
              </div>
            )}
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              {suppliesTab !== 'history' ? (
                <table className="min-w-full bg-white text-left text-xs font-medium">
                  <thead>
                    <tr className="whitespace-nowrap bg-gray-100 text-gray-500">
                      {suppliesTab === 'opening' && isEditMode && <th className="w-10 px-3 py-2"><ImportSelectionCheckbox ariaLabel="Select all opening balances" checked={openingRows.length > 0 && openingRows.every((r)=>selectedOpeningRows.has(r.suppliesno))} indeterminate={selectedOpeningRows.size > 0 && !openingRows.every((r)=>selectedOpeningRows.has(r.suppliesno))} onToggle={() => setSelectedOpeningRows(openingRows.length > 0 && openingRows.every((r)=>selectedOpeningRows.has(r.suppliesno)) ? new Set() : new Set(openingRows.map((r)=>r.suppliesno)))}/></th>}
                      <th className="px-3 py-2 font-medium uppercase">{tSuppliersModal('colNo')}</th>
                      <th className="px-3 py-2 font-medium uppercase">{tSuppliersModal('colProduct')}</th>
                      <th className="px-3 py-2 font-medium uppercase">{tSuppliersModal('colSku')}</th>
                      <th className="px-3 py-2 font-medium uppercase">Variant</th>
                      <th className="px-3 py-2 font-medium uppercase">{tSuppliersProfile('receivedCol')} (Package Type)</th>
                      <th className="px-3 py-2 font-medium uppercase">{tSuppliersProfile('totalPurchaseCol')}</th>
                      <th className="px-3 py-2 font-medium uppercase">{tSuppliersProfile('lastSuppliedDateCol')}</th>
                      {suppliesTab === 'opening' && <th className="px-3 py-2 font-medium uppercase">Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {displayedSummaryRows.length === 0 ? (
                      <tr>
                        <td colSpan={suppliesTab === 'opening' ? (isEditMode ? 9 : 8) : 7} className="px-3 py-8 text-center text-sm text-gray-500">
                          {tSuppliersProfile('noSupplies')}
                        </td>
                      </tr>
                    ) : (
                      displayedSummaryRows.slice(summaryPageStart, summaryPageEnd).map((row, idx) => (
                        <tr key={row.suppliesno || `sum-${summaryPageStart + idx}`} className="border-b last:border-b-0">
                          {suppliesTab === 'opening' && isEditMode && <td className="px-3 py-3"><ImportSelectionCheckbox ariaLabel={`Select ${row.variantName || row.product}`} checked={selectedOpeningRows.has(row.suppliesno)} onToggle={() => setSelectedOpeningRows((prev)=>{const next=new Set(prev); if(next.has(row.suppliesno))next.delete(row.suppliesno);else next.add(row.suppliesno);return next;})}/></td>}
                          <td className="px-3 py-3 font-medium text-black">{summaryPageStart + idx + 1}</td>
                          <td className="px-3 py-3 text-black">{catalogOptions.find((option) => option.sku === row.sku)?.product || row.product || '—'}</td>
                          <td className="px-3 py-3 text-black">{row.sku || '—'}</td>
                          <td className="px-3 py-3 text-black">{row.variantName || catalogOptions.find((option) => option.sku === row.sku)?.variantName || '—'}</td>
                          <td className="px-3 py-3 text-black">{row.totalSupplied || '0'}{getSupplyUnit(row) ? ` ${getSupplyUnit(row)}` : ''}</td>
                          <td className="px-3 py-3 font-semibold text-[#0a61d7]">
                            {currencySymbol}{row.totalValue || '0'}
                          </td>
                          <td className="px-3 py-3 text-black">{row.lastSuppliedDate || '—'}</td>
                          {suppliesTab === 'opening' && <td className="px-3 py-3">{isEditMode && <div className="flex items-center gap-2"><button type="button" title="Archive opening balance" aria-label={`Archive ${row.variantName || row.product}`} className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-50" disabled={archiveBusy} onClick={() => setOpeningAction({kind:'archive',rows:[row]})}><Archive className="h-4 w-4"/></button><button type="button" title="Delete opening balance" aria-label={`Delete ${row.variantName || row.product}`} className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50 disabled:opacity-50" disabled={archiveBusy} onClick={() => setOpeningAction({kind:'delete',rows:[row]})}><Trash className="h-4 w-4"/></button></div>}</td>}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="min-w-full bg-white text-left text-xs font-medium">
                  <thead>
                    <tr className="whitespace-nowrap bg-gray-100 text-gray-500">
                      <th className="w-12 px-3 py-2">
                        <ImportSelectionCheckbox
                          checked={allHistoryRowsSelected}
                          indeterminate={someHistoryRowsSelected}
                          onToggle={toggleAllHistoryRowSelection}
                          ariaLabel={allHistoryRowsSelected ? tSuppliersModal('deselectAll') : tSuppliersModal('selectAll')}
                        />
                      </th>
                      <th className="px-3 py-2 font-medium uppercase">{tSuppliersModal('colNo')}</th>
                      <th className="px-3 py-2 font-medium uppercase">{tSuppliersModal('colProduct')}</th>
                      <th className="px-3 py-2 font-medium uppercase">{tSuppliersModal('colSku')}</th>
                      <th className="px-3 py-2 font-medium uppercase">Variant</th>
                      <th className="px-3 py-2 font-medium uppercase">{tSuppliersProfile('receivedCol')} (Package Type)</th>
                      <th className="px-3 py-2 font-medium uppercase">{tSuppliersProfile('purchaseValueCol')}</th>
                      <th className="px-3 py-2 font-medium uppercase">{tSuppliersProfile('lastSuppliedDateCol')}</th>
                      <th className="px-3 py-2 text-center font-medium uppercase">{tSuppliersModal('colUpdateStock')}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyRows.slice(historyPageStart, historyPageEnd).map((row, visibleIndex) => {
                      const idx = historyPageStart + visibleIndex;
                      const deletedVariant = isDeletedVariantReceipt(row);
                      const hasReplacementVariant = deletedVariant &&
                        catalogLoadStatus === 'loaded' &&
                        hasMatchingLiveVariant(row);
                      const needsVariantLink = isLegacyUnlinkedReceipt(row) || hasReplacementVariant;
                      const canArchiveRow = canArchiveHistoryRow(row);
                      return (
                      <tr key={row.suppliesno || `hist-${idx}`} className="whitespace-nowrap">
                        <td className="px-3 py-2">
                          <ImportSelectionCheckbox
                            checked={selectedHistoryRows.has(idx)}
                            onToggle={() => toggleHistoryRowSelection(idx)}
                            ariaLabel={tImport('selectRow', { index: idx + 1 })}
                          />
                        </td>
                        <td className="px-3 py-2 font-medium text-black">{idx + 1}</td>
                        <td className="px-3 py-2">
                          <SupplyMatchDropdown
                            value={row.productId || ''}
                            displayValue={catalogOptions.find((option) => option.productId === row.productId)?.product || row.product || ''}
                            placeholder={tSuppliersModal('selectProduct')}
                            options={productDropdownOptions}
                            emptyLabel={tSuppliersModal('catalogEmpty')}
                            noMatchLabel={tSuppliersModal('catalogNoMatch')}
                            searchPlaceholder={tSuppliersModal('searchProduct')}
                            onSelect={(productId) => handleHistoryProductSelect(idx, productId)}
                            disabled={deletedVariant}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <SupplyMatchDropdown
                            value={row.variantOptionId != null ? String(row.variantOptionId) : ''}
                            displayValue={row.sku || ''}
                            placeholder={tSuppliersModal('selectSku')}
                            options={skuDropdownOptions.filter((option) => {
                              const selectedProductId = row.productId;
                              return !selectedProductId || catalogOptions.some((candidate) => String(candidate.variantOptionId ?? candidate.key) === option.value && candidate.productId === selectedProductId);
                            })}
                            emptyLabel={tSuppliersModal('catalogEmpty')}
                            noMatchLabel={tSuppliersModal('catalogNoMatch')}
                            searchPlaceholder={tSuppliersModal('searchSku')}
                            needsAttention={needsVariantLink || canArchiveRow}
                            disabled={deletedVariant}
                            attentionMessage={hasReplacementVariant
                              ? 'The original variant was deleted. This receipt is a historical snapshot and cannot be reassigned. Create a new supply row and select the new catalog variant, or archive this old receipt.'
                              : needsVariantLink
                                ? 'This older receipt has no saved link to a live catalog variant. Select the current SKU and variant so the system knows exactly which inventory item this receipt belongs to.'
                                : canArchiveRow
                                  ? 'The original catalog variant was deleted. This receipt cannot be reassigned. Create a new supply row for another variant, or archive/delete this receipt.'
                                  : undefined}
                            onSelect={(variantId) => handleHistoryVariantSelect(idx, variantId)}
                            renderOption={(option) => (
                              <span className="flex flex-col gap-0.5">
                                <span className="font-medium text-black">{option.label.split(' · ')[0]}</span>
                                <span className="text-[10px] text-gray-500">{option.label}</span>
                              </span>
                            )}
                          />
                    
                        </td>
                        <td className="px-3 py-2">
                          <SupplyMatchDropdown
                            value={row.variantOptionId != null ? String(row.variantOptionId) : ''}
                            displayValue={row.variantName ? `${row.variantName}${catalogOptions.some((option) => option.productId === row.productId && option.sku === row.sku && option.variantName === row.variantName) ? '' : ' (Archived)'}` : ''}
                            placeholder={row.productId ? tSuppliersModal('selectVariant') : tSuppliersModal('selectProduct')}
                            options={catalogOptions
                              .filter((option) => option.productId === row.productId)
                              .map((option) => ({ optionKey: option.key, value: String(option.variantOptionId ?? option.key), label: option.variantName }))}
                            emptyLabel={tSuppliersModal('catalogEmpty')}
                            noMatchLabel={tSuppliersModal('catalogNoMatch')}
                            searchPlaceholder={tSuppliersModal('searchVariant')}
                            onSelect={(variantId) => handleHistoryVariantSelect(idx, variantId)}
                            disabled={deletedVariant}
                            className={!row.productId && !row.variantName ? 'opacity-60' : ''}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex min-w-[22rem] items-center gap-2">
                            <ClientInput
                              type="number"
                              fullWidth={false}
                              compact={false}
                              className="h-9 min-w-0 flex-1"
                              value={row.receivedQuantity ?? row.totalSupplied ?? ''}
                              onChange={(receivedQuantity) => handleReceivedQuantityChange(idx, receivedQuantity)}
                            />
                            <ClientCatalogSelect
                              className="min-w-[7.5rem] shrink-0 [&>button]:h-9 [&>button]:py-0"
                              value={row.receivedUnit || 'Pieces'}
                              placeholder="Pieces"
                              options={getSupplyStockLevels(row).map((level) => ({ value: level.name, label: level.name }))}
                              allowNone={false}
                              onChange={(receivedUnit: string) => handleReceivedUnitChange(idx, receivedUnit)}
                              searchPlaceholder="Search stock type..."
                            />
                            <span className="shrink-0 whitespace-nowrap text-[10px] text-gray-400">
                              {Number(row.totalSupplied || 0).toLocaleString('en-US')} Pieces added
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center">
                            <span className="mr-2 text-xs font-medium text-gray-500">{currencySymbol}</span>
                            <ClientInput
                              fullWidth={false}
                              compact={false}
                              className="h-9 min-w-0 flex-1"
                              value={row.totalValue || ''}
                              onChange={(totalValue) => handleHistoryChange(idx, 'totalValue', totalValue)}
                              placeholder="0"
                            />
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <ClientInput
                            type="date"
                            compact={false}
                            className="h-9"
                            value={row.lastSuppliedDate || ''}
                            onChange={(lastSuppliedDate) => handleHistoryChange(idx, 'lastSuppliedDate', lastSuppliedDate)}
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={row.updateCurrentStock === true}
                            aria-label={tSuppliersModal('updateCurrentStock')}
                            onClick={() =>
                              setHistoryRows((rows) =>
                                rows.map((r, i) => {
                                  if (i !== idx) return r;
                                  return {
                                    ...r,
                                    updateCurrentStock: r.updateCurrentStock !== true,
                                    // Never invent stockApplied from the checkbox — only the server
                                    // sets it after product stock is actually applied. Preserving a
                                    // false flag lets untick→save→tick apply stock once later.
                                    stockApplied: r.stockApplied === true,
                                    recordType: 'history',
                                  };
                                }),
                              )
                            }
                            className={`mx-auto flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-all duration-200 ${
                              row.updateCurrentStock === true
                                ? 'border-green-500 bg-green-500'
                                : 'border-gray-300 bg-white hover:border-green-400'
                            }`}
                          >
                            {row.updateCurrentStock === true ? (
                              <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path
                                  fillRule="evenodd"
                                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            ) : null}
                          </button>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              className="rounded-full p-1 font-bold text-[#0a61d7] hover:bg-blue-50"
                              onClick={addHistoryRow}
                              aria-label={tSuppliersModal('addRow')}
                              title={tSuppliersModal('addRow')}
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                            {canArchiveRow ? (
                              <button
                                type="button"
                                className="rounded-full p-1 text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={archiveBusy}
                                onClick={() => setOpeningAction({ kind: 'archive', rows: [row] })}
                                title="Archive supply"
                                aria-label="Archive supply"
                              >
                                <Archive className="h-4 w-4" />
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="rounded-full p-1 font-bold text-red-500 hover:bg-red-100"
                              onClick={() => openDeleteHistoryModal([idx])}
                              title={tSuppliersModal('deleteHistoryRow')}
                              aria-label={tSuppliersModal('deleteHistoryRow')}
                            >
                              <Trash className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-gray-500">
                {tShared('pagination.showing', suppliesTab !== 'history' ? {
                  from: displayedSummaryRows.length === 0 ? 0 : summaryPageStart + 1,
                  to: summaryPageEnd,
                  total: displayedSummaryRows.length,
                } : {
                  from: historyRows.length === 0 ? 0 : historyPageStart + 1,
                  to: historyPageEnd,
                  total: historyRows.length,
                })}
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg p-2 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => suppliesTab !== 'history'
                    ? setSummaryPage((page) => Math.max(1, page - 1))
                    : setHistoryPage((page) => Math.max(1, page - 1))}
                  disabled={suppliesTab !== 'history' ? safeSummaryPage === 1 : safeHistoryPage === 1}
                  aria-label={tShared('previousPage')}
                >
                  <ChevronLeft className="h-4 w-4 text-gray-500" />
                </button>
                {(suppliesTab !== 'history'
                  ? getVisiblePageNumbers(safeSummaryPage, totalSummaryPages)
                  : getVisiblePageNumbers(safeHistoryPage, totalHistoryPages)
                ).map((pageNumber) => {
                  const activePage = suppliesTab !== 'history' ? safeSummaryPage : safeHistoryPage;
                  return (
                    <button
                      key={pageNumber}
                      type="button"
                      className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                        pageNumber === activePage ? 'bg-[#0a61d7] text-white' : 'bg-white text-[#0a61d7] hover:bg-[#f7faff]'
                      }`}
                      onClick={() => suppliesTab !== 'history' ? setSummaryPage(pageNumber) : setHistoryPage(pageNumber)}
                      aria-current={pageNumber === activePage ? 'page' : undefined}
                    >
                      {pageNumber}
                    </button>
                  );
                })}
                <button
                  type="button"
                  className="rounded-lg p-2 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => suppliesTab !== 'history'
                    ? setSummaryPage((page) => Math.min(totalSummaryPages, page + 1))
                    : setHistoryPage((page) => Math.min(totalHistoryPages, page + 1))}
                  disabled={suppliesTab !== 'history' ? safeSummaryPage === totalSummaryPages : safeHistoryPage === totalHistoryPages}
                  aria-label={tShared('nextPage')}
                >
                  <ChevronRight className="h-4 w-4 text-gray-500" />
                </button>
              </div>
            </div>
            {suppliesTab === 'history' && (
              <p className="mt-2 text-xs text-gray-500">{tSuppliersModal('updateCurrentStockHint')}</p>
            )}
            {suppliesTab !== 'history' && (
              <p className="mt-2 text-xs text-gray-500">{tSuppliersModal('summaryReadOnlyHint')}</p>
            )}
          </div>
          <div className="flex gap-2">
            <ClientField
              className="flex-1"
              label={
                <span className="flex items-center gap-1">
                  {tSuppliersModal('createdAt')}
                  <span className="text-xs text-gray-400 font-normal">{tSuppliersModal('autoGenerated')}</span>
                  <span className="w-3 h-3 bg-gray-200 rounded-full flex items-center justify-center text-[8px] text-gray-500">i</span>
                  <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>
                </span>
              }
              type="date"
              value={form.createdAt || ''}
              onChange={(createdAt) => setForm((f) => ({ ...f, createdAt }))}
              hint={tSuppliersModal('createdAtHint')}
              disabled
            />
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-700">
                {tSuppliersModal('preferredDeliveryDays')}
              </label>
              <div className="relative" ref={preferredDaysDropdownRef}>
                <button
                  type="button"
                  onClick={() => {
                    setShowPreferredDaysDropdown((open) => !open);
                    setShowStatusDropdown(false);
                  }}
                  className={CLIENT_SELECT_BUTTON_CLASS}
                  aria-haspopup="listbox"
                  aria-expanded={showPreferredDaysDropdown}
                >
                  <span className={`min-w-0 truncate ${selectedPreferredDays.length ? 'text-black' : 'text-gray-500'}`}>
                    {selectedPreferredDays.length
                      ? selectedPreferredDays.map(translateWeekday).join(', ')
                      : tSuppliersModal('selectPreferredDays')}
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
                </button>
                {showPreferredDaysDropdown && (
                  <div className="absolute bottom-full left-0 right-0 z-50 mb-1 overflow-visible rounded-lg border border-gray-300 bg-white py-1 shadow-lg" role="listbox" aria-multiselectable="true">
                    {WEEKDAYS.map((day) => {
                      const selected = selectedPreferredDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => togglePreferredDay(day)}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-gray-100 ${
                            selected ? 'bg-gray-50 font-semibold text-[#0a61d7]' : 'text-gray-700'
                          }`}
                        >
                          <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-all duration-200 ${
                            selected ? 'border-green-500 bg-green-500' : 'border-gray-300 bg-white hover:border-green-400'
                          }`} aria-hidden="true">
                            {selected ? (
                              <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            ) : null}
                          </span>
                          {translateWeekday(day)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <ClientField
              className="flex-1"
              label={
                <span className="flex items-center gap-1">
                  {tSuppliersModal('lastSuppliedDate')}
                  <span className="text-xs text-gray-400 font-normal">{tSuppliersModal('autoFromSupplies')}</span>
                  <span className="w-3 h-3 bg-gray-200 rounded-full flex items-center justify-center text-[8px] text-gray-500">i</span>
                </span>
              }
              type="date"
              value={computedLastSuppliedDate || ''}
              onChange={(lastSuppliedDate) => setForm((f) => ({ ...f, lastSuppliedDate }))}
              disabled
            />
            <ClientField
              className="flex-1"
              label={tSuppliersModal('deliverySuccessRate')}
              type="number"
              min={0}
              max={100}
              value={form.deliverySuccess || ''}
              onChange={(deliverySuccess) => setForm((f) => ({ ...f, deliverySuccess }))}
              placeholder={tSuppliersModal('deliverySuccessPlaceholder')}
            />
          </div>
          <ClientField
            className="mb-4"
            label={
              <>
                {tSuppliersModal('notesTags')}{' '}
                <span className="text-xs text-gray-400 font-normal">{tSuppliersModal('commaSeparated')}</span>
              </>
            }
            value={form.notes || ''}
            onChange={(notes) => setForm((f) => ({ ...f, notes }))}
            placeholder={tSuppliersModal('notesPlaceholder')}
          />
          
        </form>
      </div>

      {openingAction && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Confirm opening balance action">
          <div className="w-full max-w-md rounded-xl border border-[#e6e6e6] bg-white p-6 shadow-2xl">
            <h2 className="mb-2 text-lg font-bold text-gray-900">{openingAction.kind === 'delete' ? 'Delete supply records?' : openingAction.kind === 'archive' ? 'Archive supply records?' : 'Restore supply records?'}</h2>
            <p className="mb-6 text-sm text-gray-600">{openingAction.rows.length} supply record(s) selected. {openingAction.kind === 'delete' ? 'This permanently removes the selected eligible records. Historical records for live catalog variants are protected.' : openingAction.kind === 'archive' ? 'Archived records are removed from active receipt history and can be restored later.' : 'The selected records will return to active receipt history.'}</p>
            <div className="flex justify-end gap-2">
              <button type="button" className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700" onClick={() => setOpeningAction(null)}>Cancel</button>
              <button type="button" disabled={archiveBusy} className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${openingAction.kind === 'delete' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`} onClick={() => void performOpeningAction()}>Confirm {openingAction.kind}</button>
            </div>
          </div>
        </div>
      )}

      {showArchivedSupplies && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Archived Supplies">
          <div className="w-full max-w-5xl max-h-[85vh] overflow-y-auto rounded-xl border border-[#e6e6e6] bg-white py-6 text-gray-900 shadow-2xl">
            <div className="mb-5 flex items-center justify-between border-b border-[#e6e6e6] px-6 pb-4">
              <h2 className="text-lg font-bold text-black">Archived Supplies</h2>
              <button type="button" className="rounded-lg border border-[#e6e6e6] bg-white px-3 py-1.5 text-sm font-medium text-black transition-colors hover:border-gray-300 hover:bg-gray-100" onClick={() => setShowArchivedSupplies(false)}>Close</button>
            </div>
            {openingRows.length > 0 && (
              <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <h3 className="mb-1 text-sm font-semibold text-amber-900">Legacy opening snapshots</h3>
                <p className="mb-3 text-xs text-amber-800">These old catalog snapshots are not supplier receipts and are excluded from receipt totals. You can remove or archive them here.</p>
                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {openingRows.map((row) => (
                    <div key={row.suppliesno} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white p-3">
                      <div className="text-xs text-gray-800"><strong>{row.product}</strong> — {row.variantName || 'Default'} · {row.totalSupplied} Pieces</div>
                      <div className="flex gap-2">
                        <button type="button" disabled={archiveBusy} className="rounded-lg border px-2 py-1 text-xs" onClick={() => setOpeningAction({kind:'archive', rows:[row]})}>Archive</button>
                        <button type="button" disabled={archiveBusy} className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600" onClick={() => setOpeningAction({kind:'delete', rows:[row]})}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-6">
              <span className="text-xs text-gray-500">{archivedOpeningRows.length} archived supply record(s)</span>
              <div className="flex gap-2">
                <button type="button" disabled={archiveBusy || selectedArchivedRows.size === 0}
                  className="rounded-lg border border-[#e6e6e6] bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-[#0a61d7] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#e6e6e6] disabled:hover:bg-white disabled:hover:text-gray-700"
                  onClick={async () => {
                    const targets = archivedOpeningRows.filter((row) => selectedArchivedRows.has(row.suppliesno));
                    for (const row of targets) await setOpeningArchive(row, false);
                    setSelectedArchivedRows(new Set());
                  }}><RotateCcw className="mr-1 inline h-4 w-4" />Restore selected</button>
                <button type="button" disabled={archiveBusy || selectedArchivedRows.size === 0}
                  className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600 transition-colors hover:border-red-400 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-red-200 disabled:hover:bg-white disabled:hover:text-red-600"
                  onClick={() => setOpeningAction({ kind: 'delete', rows: archivedOpeningRows.filter((row) => selectedArchivedRows.has(row.suppliesno)) })}>
                  <Trash className="mr-1 inline h-4 w-4" />Delete selected
                </button>
              </div>
            </div>
            <div className="mx-6 overflow-x-auto rounded-lg border border-[#e6e6e6]">
              <table className="min-w-[1000px] w-full text-left text-xs">
                <thead className="bg-gray-100 text-gray-500">
                  <tr>
                    <th className="px-3 py-3"><ImportSelectionCheckbox
                      checked={archivedPageRows.length > 0 && archivedPageRows.every((row) => selectedArchivedRows.has(row.suppliesno))}
                      onToggle={() => setSelectedArchivedRows((previous) => {
                        const next = new Set(previous);
                        const allSelected = archivedPageRows.length > 0 && archivedPageRows.every((row) => next.has(row.suppliesno));
                        for (const row of archivedPageRows) {
                          if (allSelected) next.delete(row.suppliesno);
                          else next.add(row.suppliesno);
                        }
                        return next;
                      })}
                      ariaLabel="Select all archived supplies"
                    /></th>
                    <th className="px-3 py-3">NO.</th>
                    <th className="px-3 py-3">PRODUCT</th>
                    <th className="px-3 py-3">SKU</th>
                    <th className="px-3 py-3">VARIANT</th>
                    <th className="px-3 py-3">RECEIVED (PACKAGE TYPE)</th>
                    <th className="px-3 py-3">PURCHASE VALUE</th>
                    <th className="px-3 py-3">LAST SUPPLIED DATE</th>
                    <th className="px-3 py-3">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e6e6e6]">
                  {archivedPageRows.map((row, index) => {
                    const received = getSupplyReceivedInput(row);
                    return <tr key={row.suppliesno || index} className="text-gray-800">
                      <td className="px-3 py-3"><ImportSelectionCheckbox
                        checked={selectedArchivedRows.has(row.suppliesno)}
                        onToggle={() => setSelectedArchivedRows((previous) => {
                          const next = new Set(previous);
                          if (next.has(row.suppliesno)) next.delete(row.suppliesno);
                          else next.add(row.suppliesno);
                          return next;
                        })}
                        ariaLabel={`Select archived supply ${archivedPageStart + index + 1}`}
                      /></td>
                      <td className="px-3 py-3">{archivedPageStart + index + 1}</td>
                      <td className="px-3 py-3 font-medium">{row.product || '—'}</td>
                      <td className="px-3 py-3">{row.sku || '—'}</td>
                      <td className="px-3 py-3">{row.variantName || 'Default'}</td>
                      <td className="px-3 py-3">{received.receivedQuantity} {received.receivedUnit}</td>
                      <td className="px-3 py-3">{currencySymbol}{row.totalValue || '0'}</td>
                      <td className="px-3 py-3">{row.lastSuppliedDate || '—'}</td>
                      <td className="px-3 py-3">
                        <div className="flex gap-2">
                          <button type="button" disabled={archiveBusy} aria-label="Restore supply"
                            title="Restore supply" className="rounded-full p-1.5 text-blue-600 transition-colors hover:bg-blue-100 hover:text-blue-800 disabled:cursor-not-allowed disabled:opacity-40"
                            onClick={() => void setOpeningArchive(row, false)}><RotateCcw className="h-4 w-4"/></button>
                          <button type="button" disabled={archiveBusy} aria-label="Delete archived supply"
                            title="Delete archived supply" className="rounded-full p-1.5 text-red-500 transition-colors hover:bg-red-100 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                            onClick={() => setOpeningAction({kind:'delete',rows:[row]})}><Trash className="h-4 w-4"/></button>
                        </div>
                      </td>
                    </tr>;
                  })}
                  {archivedOpeningRows.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-gray-500">No archived supplies yet.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 px-6">
              <span className="text-xs text-gray-500">
                Showing {archivedOpeningRows.length === 0 ? 0 : archivedPageStart + 1} to {Math.min(archivedPageStart + archivedPageSize, archivedOpeningRows.length)} of {archivedOpeningRows.length}
              </span>
              <div className="flex items-center gap-2">
                <button type="button" aria-label="Previous archived supplies page"
                  disabled={safeArchivedPage === 1}
                  className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => setArchivedPage(Math.max(1, safeArchivedPage - 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: archivedTotalPages }, (_, index) => index + 1).map((page) => (
                  <button key={page} type="button" onClick={() => setArchivedPage(page)}
                    aria-label={`Archived supplies page ${page}`}
                    aria-current={safeArchivedPage === page ? 'page' : undefined}
                    className={`min-h-9 min-w-9 rounded-lg px-2 text-sm font-semibold transition ${safeArchivedPage === page ? 'bg-[#0a61d7] text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                    {page}
                  </button>
                ))}
                <button type="button" aria-label="Next archived supplies page"
                  disabled={safeArchivedPage === archivedTotalPages}
                  className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => setArchivedPage(Math.min(archivedTotalPages, safeArchivedPage + 1))}>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSuccessModal && (
        <div className="fixed inset-0 flex items-center justify-center z-[60] pointer-events-none">
          <div className="bg-green-600 text-white rounded-lg shadow-2xl p-4 flex items-center gap-4 animate-fade-in pointer-events-auto">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <CheckCircle className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-md font-semibold">{tSuppliersModal('saveSuccessTitle')}</h3>
              <p className="text-xs text-white/90">
                {isEditMode ? tSuppliersModal('saveSuccessEdit') : tSuppliersModal('saveSuccessCreate')}
              </p>
            </div>
          </div>
        </div>
      )}

      {showDeleteHistoryModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg border border-[#e6e6e6] bg-white p-4">
            <h2 className="mb-2 text-lg font-bold text-red-500">
              {deleteHistoryIndices.length > 1
                ? tSuppliersModal('bulkDeleteHistoryModalTitle')
                : tSuppliersModal('deleteHistoryModalTitle')}
            </h2>
            <p className="mb-4 text-sm text-gray-500">
              {deleteHistoryIndices.length > 1
                ? tSuppliersModal('bulkDeleteHistoryModalConfirm', { count: deleteHistoryIndices.length })
                : tSuppliersModal('deleteHistoryModalConfirm')}
            </p>
            <label className="mb-4 flex cursor-pointer items-start gap-3 rounded-lg border border-[#e6e6e6] p-3 hover:bg-gray-50">
              <button
                type="button"
                role="checkbox"
                aria-checked={deleteUpdateStock}
                aria-label={tSuppliersModal('deleteHistoryUpdateStock')}
                onClick={() => setDeleteUpdateStock((v) => !v)}
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-all duration-200 ${
                  deleteUpdateStock
                    ? 'border-green-500 bg-green-500'
                    : 'border-gray-300 bg-white hover:border-green-400'
                }`}
              >
                {deleteUpdateStock ? (
                  <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : null}
              </button>
              <span className="text-sm text-gray-700">
                <span className="font-medium text-black">{tSuppliersModal('deleteHistoryUpdateStock')}</span>
                <span className="mt-0.5 block text-xs text-gray-500">
                  {deleteHistoryIndices.length > 1
                    ? tSuppliersModal('bulkDeleteHistoryUpdateStockHint')
                    : tSuppliersModal('deleteHistoryUpdateStockHint')}
                </span>
              </span>
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg bg-gray-200 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500"
                onClick={handleDeleteHistoryCancel}
              >
                {tShared('cancel')}
              </button>
              <button
                type="button"
                className="rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                onClick={handleDeleteHistoryConfirm}
              >
                {tShared('deleteModal.deleteButton')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

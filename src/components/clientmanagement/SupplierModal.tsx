'use client';
import React, { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Trash, Plus, AlertCircle, CheckCircle, ChevronDown, ArrowLeft, Save, Upload, Download, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import { useUserStore } from '@/store/userStore';
import { Supplier, SupplyDetail, SupplierFormData } from '@/types/client';
import { getDefaultCurrency, getCurrencySymbol } from '@/utils/currencyUtils';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useClientsTranslations } from '@/hooks/useClientsTranslations';
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
import SupplyMoveModal, {
  SupplyMoveNotice,
  type SupplyMoveCandidateRow,
} from '@/components/clientmanagement/SupplyMoveModal';
import {
  mergeDuplicateSummaryRows,
  partitionSupplies,
  serializeHistorySupplyForStorage,
} from '@/lib/suppliers/supplyRecords';
import type { SupplyDeleteMarker } from '@/lib/suppliers/applySupplierSuppliesSave';

const categories = ["Instant Noodles", "Mineral Water", "Rice", "Bread"];
const statusOptions = ["Active", "Inactive", "Blocked"];

type CatalogVariantOption = {
  key: string;
  sku: string;
  product: string;
  productId: string;
  variantName: string;
};

type ProductCatalogNode = {
  productId: string;
  name: string;
  supplier?: string | null;
  variantOptions?: Array<{
    variantName?: string | null;
    sku?: string | null;
    isActive?: boolean | null;
  }> | null;
};

function catalogProductLabel(productName: string, variantName: string): string {
  const name = productName.trim();
  const variant = variantName.trim();
  if (!variant || variant.toLowerCase() === 'default') return name;
  return `${name} (${variant})`;
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
      const key = `${productId}|${variantName}|${sku}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
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
  placeholder,
  options,
  emptyLabel,
  noMatchLabel,
  searchPlaceholder,
  onSelect,
  renderOption,
  className = '',
  needsAttention = false,
}: {
  value: string;
  placeholder: string;
  options: Array<{ value: string; label: string; optionKey: string }>;
  emptyLabel: string;
  noMatchLabel: string;
  searchPlaceholder: string;
  onSelect: (value: string) => void;
  renderOption?: (option: { value: string; label: string }) => React.ReactNode;
  className?: string;
  /** Highlight empty control (e.g. ambiguous product needs SKU). */
  needsAttention?: boolean;
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
      <button
        ref={buttonRef}
        type="button"
        className={`flex w-full items-center justify-between gap-1 rounded-lg border px-2 py-1.5 text-left text-xs text-black hover:bg-gray-100 ${
          needsAttention
            ? 'border-amber-400 bg-amber-50 ring-1 ring-amber-200'
            : 'border-[#e6e6e6] bg-white'
        }`}
        onClick={() => setOpen((next) => !next)}
      >
        <span className={`truncate ${value ? 'text-black' : needsAttention ? 'font-medium text-amber-700' : 'text-gray-500'}`}>
          {value || placeholder}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 ${needsAttention ? 'text-amber-600' : 'text-gray-400'}`} />
      </button>
      {menu}
    </div>
  );
}

/** Product chosen but SKU/productId cleared (ambiguous label). */
function isUnresolvedHistoryRow(row: SupplyDetail): boolean {
  const product = String(row.product || '').trim();
  const sku = String(row.sku || '').trim();
  const productId = String(row.productId || '').trim();
  return Boolean(product) && !sku && !productId;
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
    totalValue: '',
    lastDelivery: '',
    status: statusOptions[0],
    recordType: 'history',
    updateCurrentStock: true,
  };
}

function normalizeSupplyRow(row: SupplyDetail, recordType: 'history' | 'summary'): SupplyDetail {
  if (recordType === 'history') {
    return serializeHistorySupplyForStorage({
      ...row,
      status: row.status || statusOptions[0],
    });
  }
  return {
    suppliesno: row.suppliesno || '',
    sku: row.sku || '',
    product: row.product || '',
    totalSupplied: row.totalSupplied || '',
    totalValue: row.totalValue || '',
    lastDelivery: row.lastDelivery || '',
    status: row.status || statusOptions[0],
    recordType: 'summary',
    productId: row.productId,
    variantName: row.variantName,
  };
}

function parseSupplyBuckets(raw?: string | null): { history: SupplyDetail[]; summary: SupplyDetail[] } {
  if (!raw) return { history: [emptyHistoryRow()], summary: [] };
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return { history: [emptyHistoryRow()], summary: [] };
    }
    const { history, summary } = partitionSupplies(parsed as SupplyDetail[]);
    return {
      history: history.length > 0
        ? ensureUniqueHistoryIds(history.map((row) => normalizeSupplyRow(row, 'history')))
        : [emptyHistoryRow()],
      summary: mergeDuplicateSummaryRows(summary).map((row) => normalizeSupplyRow(row, 'summary')),
    };
  } catch {
    return { history: [emptyHistoryRow()], summary: [] };
  }
}

function isBlankHistoryRow(row: SupplyDetail): boolean {
  return !(
    String(row.sku || '').trim() ||
    String(row.product || '').trim() ||
    String(row.totalSupplied || '').trim() ||
    String(row.totalValue || '').trim() ||
    String(row.lastDelivery || '').trim()
  );
}

function stableHistoryId(row: SupplyDetail, index: number): string {
  const seed = [
    String(row.sku || '').trim(),
    String(row.productId || '').trim(),
    String(row.variantName || '').trim(),
    String(row.product || '').trim(),
    String(row.lastDelivery || '').trim(),
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
        status: statusOptions[0], createdAt: new Date().toISOString().split('T')[0], preferredDays: '', lastDelivery: '', 
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
      lastDelivery: parsedLogistics.lastDelivery && !parsedLogistics.lastDelivery.includes('Missing') ? parsedLogistics.lastDelivery : '',
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
  const [suppliesTab, setSuppliesTab] = useState<'summary' | 'history'>('history');
  const [showImportSupplies, setShowImportSupplies] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState<ProductCatalogNode[]>([]);
  const [pendingDeleteMarkers, setPendingDeleteMarkers] = useState<SupplyDeleteMarker[]>([]);
  const [showDeleteHistoryModal, setShowDeleteHistoryModal] = useState(false);
  // Row indices awaiting delete confirmation: one for the row trash, many for bulk delete.
  const [deleteHistoryIndices, setDeleteHistoryIndices] = useState<number[]>([]);
  const [deleteUpdateStock, setDeleteUpdateStock] = useState(false);
  const [selectedHistoryRows, setSelectedHistoryRows] = useState<Set<number>>(new Set());
  const [moveCandidates, setMoveCandidates] = useState<SupplyMoveCandidateRow[]>([]);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [movingSupplies, setMovingSupplies] = useState(false);

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
  
  const statusDropdownRef = useRef<HTMLDivElement>(null);

  // Function to get the latest delivery date
  const getLatestDeliveryDate = useCallback((rows: SupplyDetail[]) => {
    if (!rows || rows.length === 0) return '';
    const dates = rows
      .map(row => row.lastDelivery)
      .filter(date => date && date.trim() !== '')
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    return dates.length > 0 ? dates[0] : '';
  }, []);

  // Compute lastDelivery during render (not in useEffect) - follows React best practices
  // Use computed value directly instead of storing in state
  const computedLastDelivery = useMemo(() => {
    return getLatestDeliveryDate(historyRows);
  }, [historyRows, getLatestDeliveryDate]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setShowStatusDropdown(false);
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
                  supplier
                  variantOptions { variantName sku isActive }
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
        if (!cancelled) setCatalogProducts(all);
      } catch {
        if (!cancelled) setCatalogProducts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const catalogOptions = useMemo(() => {
    const base = buildCatalogOptions(catalogProducts, form.supplierName || initialData?.name);
    const seen = new Set(base.map((opt) => opt.sku));
    for (const row of historyRows) {
      const sku = String(row.sku || '').trim();
      if (!sku || seen.has(sku)) continue;
      seen.add(sku);
      base.push({
        key: `legacy:${sku}`,
        sku,
        product: String(row.product || '').trim() || sku,
        productId: String(row.productId || '').trim(),
        variantName: String(row.variantName || '').trim(),
      });
    }
    return base;
  }, [catalogProducts, form.supplierName, initialData?.name, historyRows]);

  /** Strict ownership list for import validation — no full-catalog fallback. */
  const supplierOwnedCatalog = useMemo(
    () =>
      buildCatalogOptions(catalogProducts, form.supplierName || initialData?.name, {
        fallbackToAll: false,
      }).map((opt) => ({ sku: opt.sku, product: opt.product })),
    [catalogProducts, form.supplierName, initialData?.name],
  );

  const skuDropdownOptions = useMemo(
    () =>
      catalogOptions.map((opt) => ({
        optionKey: opt.key,
        value: opt.sku,
        label: opt.product,
      })),
    [catalogOptions],
  );

  const productDropdownOptions = useMemo(() => {
    const seen = new Set<string>();
    const rows: Array<{ optionKey: string; value: string; label: string }> = [];
    for (const opt of catalogOptions) {
      if (seen.has(opt.product)) continue;
      seen.add(opt.product);
      rows.push({ optionKey: `product:${opt.product}`, value: opt.product, label: opt.product });
    }
    return rows.sort((a, b) => a.value.localeCompare(b.value));
  }, [catalogOptions]);

  // History rows only — summary is read-only on the edit page
  const handleHistoryChange = useCallback((idx: number, field: keyof SupplyDetail, value: string) => {
    setHistoryRows((rows) =>
      rows.map((row, i) => (i === idx ? { ...row, [field]: value, recordType: 'history' } : row)),
    );
  }, []);

  const handleHistorySkuSelect = useCallback(
    (idx: number, sku: string) => {
      const match = catalogOptions.find((opt) => opt.sku === sku);
      setHistoryRows((rows) =>
        rows.map((row, i) =>
          i === idx
            ? {
                ...row,
                sku,
                product: match?.product || row.product,
                productId: match?.productId || row.productId,
                variantName: match?.variantName || row.variantName,
                recordType: 'history',
              }
            : row,
        ),
      );
    },
    [catalogOptions],
  );

  const handleHistoryProductSelect = useCallback(
    (idx: number, product: string) => {
      const matches = catalogOptions.filter((opt) => opt.product === product);
      const only = matches.length === 1 ? matches[0] : undefined;
      setHistoryRows((rows) =>
        rows.map((row, i) => {
          if (i !== idx) return row;
          // Ambiguous labels must not inherit productId from the first match.
          // Keep ids empty unless this row's SKU uniquely identifies a variant.
          const skuMatch = matches.find((m) => m.sku === row.sku);
          const identified = only || skuMatch;
          return {
            ...row,
            product,
            sku: identified?.sku || '',
            productId: identified?.productId || '',
            variantName: identified?.variantName || '',
            // Ambiguous product: never keep stock updates on while identity is unresolved.
            updateCurrentStock: identified ? row.updateCurrentStock === true : false,
            recordType: 'history',
          };
        }),
      );
    },
    [catalogOptions],
  );

  const addHistoryRow = useCallback(() => {
    setHistoryRows((rows) => [...rows, emptyHistoryRow()]);
  }, []);

  const allHistoryRowsSelected = historyRows.length > 0 && selectedHistoryRows.size === historyRows.length;
  const someHistoryRowsSelected = selectedHistoryRows.size > 0 && !allHistoryRowsSelected;

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
        selectedHistoryRows.has(i)
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
    const headers = ['SKU', 'Product', 'Total Supplied', 'Total Value', 'Last Delivery'];
    const rows = exportRows.map((row) => [
      row.sku || '',
      row.product || '',
      row.totalSupplied || '',
      row.totalValue || '',
      row.lastDelivery || '',
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Supply History');
    XLSX.writeFile(wb, `${form.supplierName || id || 'supplier'}-supply-history.xlsx`);
  }, [historyRows, form.supplierName, id]);

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
    // Blank rows are dropped on import, which shifts indices.
    setSelectedHistoryRows(new Set());
    setSuppliesTab('history');
    setShowImportSupplies(false);
  }, [historyRows, pendingDeleteMarkers]);

  // Hydrate form when initialData is provided (edit)
  useEffect(() => {
    if (!initialData || !isEditMode) return;

    const parsedNotes = safeParseJSON(initialData.notes || '', []);
    const parsedLogistics = safeParseJSON(initialData.logistics || '', {});

    const buckets = parseSupplyBuckets(initialData.supplies);
    const latestDeliveryDate = getLatestDeliveryDate(buckets.history);

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
      lastDelivery: latestDeliveryDate || parsedLogistics.lastDelivery || '',
      deliverySuccess: parsedLogistics.deliverySuccess || '',
      notes: Array.isArray(parsedNotes) ? parsedNotes.join(', ') : '',
    });

    setId(initialData.supplierId || generateSupplierId());
    setSummaryRows(buckets.summary);
    setHistoryRows(buckets.history);
    setSelectedHistoryRows(new Set());
    setPendingDeleteMarkers([]);
    setShowDeleteHistoryModal(false);
    setDeleteHistoryIndices([]);
    setDeleteUpdateStock(false);
    setSuppliesTab('history');
    setValidationErrors({});
    setError('');
    setSuccess('');
    setSubmitAttempted(false);
  }, [initialData, isEditMode, safeParseJSON, getLatestDeliveryDate]);

  useEffect(() => {
    let cancelled = false;
    const userId = user?.id;
    const supplierKey = String(initialData?.supplierId || id || '').trim();
    if (!isEditMode || !userId || !supplierKey) {
      setMoveCandidates([]);
      return;
    }
    (async () => {
      try {
        const data = await fetchGraphQL<{
          supplierSupplyMoveCandidates: SupplyMoveCandidateRow[];
        }>(
          `query SupplierSupplyMoveCandidates($userId: Int!, $supplierId: String!) {
            supplierSupplyMoveCandidates(userId: $userId, supplierId: $supplierId) {
              productId
              variantName
              sku
              productLabel
              targetSupplierName
              historyCount
              totalSupplied
              totalValue
            }
          }`,
          { userId, supplierId: supplierKey },
        );
        if (!cancelled) setMoveCandidates(data.supplierSupplyMoveCandidates || []);
      } catch {
        if (!cancelled) setMoveCandidates([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEditMode, user?.id, initialData?.supplierId, initialData?.supplies, id]);

  const handleConfirmSupplyMove = useCallback(
    async (variants: Array<{ productId: string; variantName: string }>) => {
      const userId = user?.id;
      const supplierKey = String(initialData?.supplierId || id || '').trim();
      if (!userId || !supplierKey || variants.length === 0) return;
      setMovingSupplies(true);
      try {
        const data = await fetchGraphQL<{
          moveSupplierSupplies: {
            success: boolean;
            movedHistoryCount: number;
            supplies?: string | null;
            message?: string | null;
          };
        }>(
          `mutation MoveSupplierSupplies(
            $userId: Int!
            $fromSupplierId: String!
            $variants: [SupplyMoveVariantInput!]!
          ) {
            moveSupplierSupplies(
              userId: $userId
              fromSupplierId: $fromSupplierId
              variants: $variants
            ) {
              success
              movedHistoryCount
              supplies
              message
            }
          }`,
          { userId, fromSupplierId: supplierKey, variants },
        );
        const result = data.moveSupplierSupplies;
        const buckets = parseSupplyBuckets(result.supplies);
        setSummaryRows(buckets.summary);
        setHistoryRows(
          buckets.history.length > 0 ? buckets.history : [emptyHistoryRow()],
        );
        setSelectedHistoryRows(new Set());
        setPendingDeleteMarkers([]);
        setMoveCandidates((prev) =>
          prev.filter(
            (row) =>
              !variants.some(
                (v) => v.productId === row.productId && v.variantName === row.variantName,
              ),
          ),
        );
        setShowMoveModal(false);
        setSuccess(
          tSuppliersProfile('supplyMoveSuccess', { count: result.movedHistoryCount || 0 }),
        );
      } catch (error) {
        setError(
          error instanceof Error ? error.message : tSuppliersProfile('supplyMoveFailed'),
        );
      } finally {
        setMovingSupplies(false);
      }
    },
    [user?.id, initialData?.supplierId, id, tSuppliersProfile],
  );

  // Enhanced form submission
  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    if (isSubmitting || isNavigating) return;

    setError('');
    setSuccess('');

    if (!validateForm()) return;

    const unresolvedStockRows = historyRows.filter((row) => {
      if (isBlankHistoryRow(row)) return false;
      if (row.updateCurrentStock !== true) return false;
      const qty = Number(String(row.totalSupplied || '').replace(/[^\d.-]/g, ''));
      if (!Number.isFinite(qty) || qty <= 0) return false;
      return !String(row.sku || '').trim() && !String(row.productId || '').trim();
    });
    if (unresolvedStockRows.length > 0) {
      handleError(tSuppliersModal('selectSkuBeforeStockUpdate'));
      setSuppliesTab('history');
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
      const cleanedSummary = summaryRows.map((row) => normalizeSupplyRow(row, 'summary'));
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
          lastDelivery: computedLastDelivery || '',
          deliverySuccess: form.deliverySuccess || ''
        }),
        userId: user?.id,
      };
      if (isEditMode && initialData && typeof initialData.id === 'number') {
        payload.id = initialData.id;
      }
      delete payload.supplierName;
      delete payload.preferredDays;
      delete payload.lastDelivery;
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
  }, [form, id, historyRows, summaryRows, pendingDeleteMarkers, isEditMode, initialData, user?.id, onSave, router, validateForm, handleError, isSubmitting, isNavigating, tSuppliersModal, computedLastDelivery]);

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
          {/* Supplies & Product Data — summary read-only; history editable via table + import/export */}
          <div className="my-2 border-t border-gray-200 pt-2">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <label className="block text-sm font-bold text-black">{tSuppliersModal('suppliesSection')}</label>
              {suppliesTab === 'history' && (
                <div className="flex flex-wrap gap-2">
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
                </div>
              )}
            </div>
            <div className="mb-3 inline-flex rounded-full border border-[#e6e6e6] bg-gray-50 p-1">
              <button
                type="button"
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  suppliesTab === 'summary'
                    ? 'bg-white text-black shadow-sm'
                    : 'text-gray-500 hover:text-black'
                }`}
                onClick={() => setSuppliesTab('summary')}
              >
                {tSuppliersProfile('supplySummaryTab')}
              </button>
              <button
                type="button"
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  suppliesTab === 'history'
                    ? 'bg-white text-black shadow-sm'
                    : 'text-gray-500 hover:text-black'
                }`}
                onClick={() => setSuppliesTab('history')}
              >
                {tSuppliersProfile('supplyHistoryTab')}
              </button>
            </div>
            <SupplyMoveNotice
              count={moveCandidates.length}
              onReviewAction={() => setShowMoveModal(true)}
            />
            {showMoveModal && (
              <SupplyMoveModal
                open={showMoveModal}
                candidates={moveCandidates}
                currency={user?.currency || getDefaultCurrency()}
                submitting={movingSupplies}
                onCloseAction={() => setShowMoveModal(false)}
                onConfirmAction={handleConfirmSupplyMove}
              />
            )}
            {showImportSupplies && (
              <ImportSuppliesModal
                open={showImportSupplies}
                onCloseAction={() => setShowImportSupplies(false)}
                onImportAction={handleImportHistory}
                supplierCatalog={supplierOwnedCatalog}
              />
            )}
            {suppliesTab === 'history' && selectedHistoryRows.size > 0 && (
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#e6e6e6] border-l-4 border-l-green-500 bg-white p-3 shadow-sm">
                <span className="text-sm font-semibold text-green-700">
                  {tSuppliersModal('historyRowsSelected', { count: selectedHistoryRows.size })}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-lg border border-[#e6e6e6] bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-gray-50"
                    onClick={handleBulkUpdateStock}
                  >
                    {tSuppliersModal('bulkUpdateStock')}
                  </button>
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
              {suppliesTab === 'summary' ? (
                <table className="min-w-full bg-white text-left text-xs font-medium">
                  <thead>
                    <tr className="whitespace-nowrap bg-gray-100 text-gray-500">
                      <th className="px-3 py-2 font-medium uppercase">{tSuppliersModal('colNo')}</th>
                      <th className="px-3 py-2 font-medium uppercase">{tSuppliersProfile('skuProductCol')}</th>
                      <th className="px-3 py-2 font-medium uppercase">{tSuppliersProfile('totalSuppliedCol')}</th>
                      <th className="px-3 py-2 font-medium uppercase">{tSuppliersProfile('totalPurchaseCol')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryRows.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-8 text-center text-sm text-gray-500">
                          {tSuppliersProfile('noSupplies')}
                        </td>
                      </tr>
                    ) : (
                      summaryRows.map((row, idx) => (
                        <tr key={row.suppliesno || `sum-${idx}`} className="border-b last:border-b-0">
                          <td className="px-3 py-3 font-medium text-black">{idx + 1}</td>
                          <td className="px-3 py-3 text-black">
                            <div className="font-medium">{row.sku || '—'}</div>
                            <div className="text-gray-500">{row.product || '—'}</div>
                          </td>
                          <td className="px-3 py-3 text-black">{row.totalSupplied || '0'}</td>
                          <td className="px-3 py-3 font-semibold text-[#0a61d7]">
                            {currencySymbol}{row.totalValue || '0'}
                          </td>
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
                      <th className="px-3 py-2 font-medium uppercase">{tSuppliersModal('colSku')}</th>
                      <th className="px-3 py-2 font-medium uppercase">{tSuppliersModal('colProduct')}</th>
                      <th className="px-3 py-2 font-medium uppercase">{tSuppliersProfile('receivedCol')}</th>
                      <th className="px-3 py-2 font-medium uppercase">{tSuppliersProfile('purchaseValueCol')}</th>
                      <th className="px-3 py-2 font-medium uppercase">{tSuppliersProfile('lastSuppliedDateCol')}</th>
                      <th className="px-3 py-2 text-center font-medium uppercase">{tSuppliersModal('colUpdateStock')}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyRows.map((row, idx) => {
                      const needsSku = isUnresolvedHistoryRow(row);
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
                            value={row.sku || ''}
                            placeholder={tSuppliersModal('selectSku')}
                            options={skuDropdownOptions}
                            emptyLabel={tSuppliersModal('catalogEmpty')}
                            noMatchLabel={tSuppliersModal('catalogNoMatch')}
                            searchPlaceholder={tSuppliersModal('searchSku')}
                            needsAttention={needsSku}
                            onSelect={(sku) => handleHistorySkuSelect(idx, sku)}
                            renderOption={(option) => (
                              <span className="flex flex-col gap-0.5">
                                <span className="font-medium text-black">{option.value}</span>
                                <span className="text-[10px] text-gray-500">{option.label}</span>
                              </span>
                            )}
                          />
                          {needsSku ? (
                            <p className="mt-1 text-[10px] font-medium text-amber-700">
                              {tSuppliersModal('selectSku')}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">
                          <SupplyMatchDropdown
                            value={row.product || ''}
                            placeholder={tSuppliersModal('selectProduct')}
                            options={productDropdownOptions}
                            emptyLabel={tSuppliersModal('catalogEmpty')}
                            noMatchLabel={tSuppliersModal('catalogNoMatch')}
                            searchPlaceholder={tSuppliersModal('searchProduct')}
                            onSelect={(product) => handleHistoryProductSelect(idx, product)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <ClientInput
                            type="number"
                            value={row.totalSupplied || ''}
                            onChange={(totalSupplied) => handleHistoryChange(idx, 'totalSupplied', totalSupplied)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center">
                            <span className="mr-2 text-xs font-medium text-gray-500">{currencySymbol}</span>
                            <ClientInput
                              fullWidth={false}
                              className="min-w-0 flex-1"
                              value={row.totalValue || ''}
                              onChange={(totalValue) => handleHistoryChange(idx, 'totalValue', totalValue)}
                              placeholder="0"
                            />
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <ClientInput
                            type="date"
                            value={row.lastDelivery || ''}
                            onChange={(lastDelivery) => handleHistoryChange(idx, 'lastDelivery', lastDelivery)}
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
            {suppliesTab === 'history' && (
              <p className="mt-2 text-xs text-gray-500">{tSuppliersModal('updateCurrentStockHint')}</p>
            )}
            {suppliesTab === 'summary' && (
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
                </span>
              }
              type="date"
              value={form.createdAt || ''}
              onChange={(createdAt) => setForm((f) => ({ ...f, createdAt }))}
              required
              disabled
            />
            <ClientField
              className="flex-1"
              label={tSuppliersModal('preferredDeliveryDays')}
              value={form.preferredDays || ''}
              onChange={(preferredDays) => setForm((f) => ({ ...f, preferredDays }))}
              placeholder={tSuppliersModal('preferredDaysPlaceholder')}
            />
          </div>
          <div className="flex gap-2">
            <ClientField
              className="flex-1"
              label={
                <span className="flex items-center gap-1">
                  {tSuppliersModal('lastDeliveryDate')}
                  <span className="text-xs text-gray-400 font-normal">{tSuppliersModal('autoFromSupplies')}</span>
                  <span className="w-3 h-3 bg-gray-200 rounded-full flex items-center justify-center text-[8px] text-gray-500">i</span>
                </span>
              }
              type="date"
              value={computedLastDelivery || ''}
              onChange={(lastDelivery) => setForm((f) => ({ ...f, lastDelivery }))}
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
          
          {/* Success Message */}
          {success && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
              <span className="text-green-800 text-xs font-medium">{success}</span>
            </div>
          )}
          
          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <span className="text-red-800 text-xs font-medium">{error}</span>
            </div>
          )}
        </form>
      </div>

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

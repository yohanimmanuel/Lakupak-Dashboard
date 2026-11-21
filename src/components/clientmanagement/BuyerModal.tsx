'use client';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Trash, Plus, User, Upload, Download, AlertCircle, CheckCircle, ChevronDown, ChevronLeft, ChevronRight, ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import { useUserStore } from '@/store/userStore';
import { Buyer, BuyerFormData, OrderDetail } from '@/types/client';
import { generateSecureBuyerId } from '@/utils/buyer-security';
import {
  validateOptionalEmail,
  validateRequiredPhone,
  validateRequiredField,
  mapBuyerFieldError,
  clearValidationField,
} from '@/utils/client-input-validation';
import { ClientField, ClientInput } from '@/components/clientmanagement/ClientField';
import { ClientValidatedField } from '@/components/clientmanagement/ClientValidatedField';
import { CLIENT_SELECT_BUTTON_CLASS } from '@/components/clientmanagement/client-field-styles';
import ImportOrdersModal from '@/components/clientmanagement/ImportOrdersModal';
import ClientCatalogSelect from '@/components/clientmanagement/ClientCatalogSelect';
import ImportSelectionCheckbox from '@/components/clientmanagement/ImportSelectionCheckbox';
import MapComponent from '@/components/ordershipment/MapComponent';
import { getDefaultCurrency, getCurrencySymbol } from '@/utils/currencyUtils';
import { uploadToCloudinaryDirect } from '@/utils/cloudinaryDirect';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { calculatePromotionGift } from '@/utils/promotionUtils';
import { useClientsTranslations } from '@/hooks/useClientsTranslations';
import { geocodeAddress, type MapCoordinates } from '@/utils/mapboxUtils';
import type { StockLevel } from '@/types/product';
import { formatBuyerOrderTotal, normalizeBuyerOrderTotal, parseBuyerOrderTotal } from '@/utils/buyerOrderQuantity';
import { getVisiblePageNumbers } from '@/utils/tablePagination';

const JAKARTA: MapCoordinates = { longitude: 106.8456, latitude: -6.2088 };

const statusOptions = ["Active", "Prospect", "Inactive", "Blocked"];

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

type BuyerCatalogProduct = {
  productId: string;
  name: string;
  stockLevels?: StockLevel[] | null;
  /** Variant sellingPrice is stored in the database normalized per Piece. */
  variantOptions?: Array<{
    id: number;
    variantName: string;
    sku?: string | null;
    sellingPrice: number;
    isActive?: boolean | null;
  }> | null;
};

type MarketplaceOrderLineForBuyer = {
  id: number;
  productId: string | null;
  productName: string;
  productSkuSnapshot: string | null;
  packageQuantity: number | null;
  packageType: string | null;
  piecesPerPackage: number | null;
  subtotal: number;
  pricePerPackage: number | null;
  variantOptionId: number | null;
  variantId: number | null;
  variantNameSnapshot: string | null;
  promotionDetailsSnapshot: string | null;
  moqSnapshot: number | null;
};

function parseBuyerAmount(value: string | number | null | undefined): number {
  const raw = String(value ?? '').trim();
  const normalized = raw.replace(/[^\d,.-]/g, '').replace(/,(?=\d{3}(?:\D|$))/g, '');
  const parsed = Number(normalized);
  if (Number.isFinite(parsed)) return parsed;
  const digitsOnly = Number(raw.replace(/[^\d-]/g, ''));
  return Number.isFinite(digitsOnly) ? digitsOnly : 0;
}

function formatBuyerAmount(value: number): string {
  return String(Math.round((Number.isFinite(value) ? value : 0) * 100) / 100);
}

function isMarketplaceOrderNo(value: string | undefined): boolean {
  return /^LKO-\d+(?:-\d+)?$/i.test(String(value || '').trim());
}

const WEEKDAY_ALIASES: Record<string, Weekday> = {
  mon: 'Monday',
  monday: 'Monday',
  sen: 'Monday',
  senin: 'Monday',
  tue: 'Tuesday',
  tues: 'Tuesday',
  tuesday: 'Tuesday',
  sel: 'Tuesday',
  selasa: 'Tuesday',
  wed: 'Wednesday',
  weds: 'Wednesday',
  wednesday: 'Wednesday',
  rab: 'Wednesday',
  rabu: 'Wednesday',
  thu: 'Thursday',
  thur: 'Thursday',
  thurs: 'Thursday',
  thursday: 'Thursday',
  kam: 'Thursday',
  kamis: 'Thursday',
  fri: 'Friday',
  friday: 'Friday',
  jum: 'Friday',
  jumat: 'Friday',
  "jum'at": 'Friday',
  sat: 'Saturday',
  saturday: 'Saturday',
  sab: 'Saturday',
  sabtu: 'Saturday',
  sun: 'Sunday',
  sunday: 'Sunday',
  min: 'Sunday',
  minggu: 'Sunday',
};

function parsePreferredDays(value: string): Weekday[] {
  if (!value.trim()) return [];
  const selected = new Set<Weekday>();
  for (const part of value.split(/[,;/|]+/)) {
    const key = part.trim().toLowerCase();
    if (!key) continue;
    const mapped = WEEKDAY_ALIASES[key];
    if (mapped) selected.add(mapped);
  }
  return WEEKDAYS.filter((day) => selected.has(day));
}

function formatPreferredDays(days: readonly string[]): string {
  return WEEKDAYS.filter((day) => days.includes(day)).join(', ');
}

function isBlankOrderRow(row: OrderDetail): boolean {
  return !(
    String(row.product || '').trim() ||
    String(row.totalOrders || '').trim() ||
    String(row.totalSpend || '').trim() ||
    String(row.lastOrderDate || '').trim() ||
    String(row.outstanding || '').trim()
  );
}

interface BuyerModalProps {
  initialData?: Buyer;
  mode?: 'edit' | 'add';
  onSave?: (data: BuyerFormData) => void;
}

export default function BuyerModal({ initialData, mode = 'add', onSave }: BuyerModalProps) {
  const router = useRouter();
  const user = useUserStore(state => state.user);
  const { tBuyersModal, tBuyersProfile, tShared, tImport, translateStatus } = useClientsTranslations();
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

  // Enhanced state management with proper typing
  const [form, setForm] = useState<BuyerFormData>(() => {
    if (!initialData) {
      return {
        storeName: '', 
        owner: '', 
        phone: '', 
        email: '', 
        address: '', 
        businessType: '', 
        status: statusOptions[0], 
        createdAt: new Date().toISOString().split('T')[0], 
        preferredDays: '', 
        lastShipment: '', 
        lastVisit: '',
        shipmentSuccess: '', 
        notes: '',
      };
    }
    
    // Parse JSON strings from database
    const parsedNotes = safeParseJSON(initialData.notes || '', []);
    const parsedLogistics = safeParseJSON(initialData.logistics || '', {});
    
    return {
      storeName: initialData.storeName && !initialData.storeName.includes('Missing') ? initialData.storeName : '',
      owner: initialData.owner && !initialData.owner.includes('Missing') ? initialData.owner : '',
      phone: initialData.phone && !initialData.phone.includes('Missing') ? initialData.phone : '',
      email: initialData.email && !initialData.email.includes('Missing') ? initialData.email : '',
      address: initialData.address && !initialData.address.includes('Missing') ? initialData.address : '',
      businessType: initialData.businessType && !initialData.businessType.includes('Missing') ? initialData.businessType : '',
      status: initialData.status || statusOptions[0],
      createdAt: initialData.createdAt ? new Date(initialData.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      preferredDays: parsedLogistics.preferredDays && !parsedLogistics.preferredDays.includes('Missing') ? parsedLogistics.preferredDays : '',
      lastShipment: parsedLogistics.lastShipment && !parsedLogistics.lastShipment.includes('Missing') ? parsedLogistics.lastShipment : '',
      lastVisit: parsedLogistics.lastVisit && !String(parsedLogistics.lastVisit).includes('Missing') ? String(parsedLogistics.lastVisit) : '',
      shipmentSuccess: parsedLogistics.shipmentSuccess && !parsedLogistics.shipmentSuccess.includes('Missing') ? parsedLogistics.shipmentSuccess : '',
      notes: Array.isArray(parsedNotes) ? parsedNotes.join(', ') : '',
    };
  });
  
  const [id, setId] = useState(() => initialData?.id || generateSecureBuyerId());
  const [orderRows, setOrderRows] = useState<OrderDetail[]>(
    initialData?.orderDetails ? (() => {
      try {
        const parsed = JSON.parse(initialData.orderDetails);
        return Array.isArray(parsed) ? parsed.map((row: OrderDetail) => ({
          orderNo: row.orderNo || '',
          product: row.product || '',
          productId: row.productId || '',
          variantOptionId: row.variantOptionId == null ? '' : String(row.variantOptionId),
          variantName: row.variantName || '',
          sku: row.sku || '',
          pricePerPackage: row.pricePerPackage == null ? '' : String(row.pricePerPackage),
          stockType: row.stockType || parseBuyerOrderTotal(row.totalOrders || '', 'Boxes').unit,
          piecesPerPackage: Number(row.piecesPerPackage) > 0 ? Number(row.piecesPerPackage) : undefined,
          totalOrders: normalizeBuyerOrderTotal(row.totalOrders || '', row.stockType || 'Boxes'),
          totalSpend: row.totalSpend || '',
          shippingFee: row.shippingFee || '',
          lastOrderDate: row.lastOrderDate || '',
          outstanding: row.outstanding || '',
          syncedFromOrders: row.syncedFromOrders === true,
        })) : [{ orderNo: '', product: '', productId: '', variantOptionId: '', variantName: '', stockType: 'Pieces', totalOrders: '', totalSpend: '', shippingFee: '', lastOrderDate: '', outstanding: '' }];
      } catch {
        return [{ orderNo: '', product: '', productId: '', variantOptionId: '', variantName: '', stockType: 'Pieces', totalOrders: '', totalSpend: '', shippingFee: '', lastOrderDate: '', outstanding: '' }];
      }
    })() : [{ orderNo: '', product: '', productId: '', variantOptionId: '', variantName: '', stockType: 'Pieces', totalOrders: '', totalSpend: '', shippingFee: '', lastOrderDate: '', outstanding: '' }]
  );

  // Keep buyer order details manageable without changing the underlying orderRows array.
  const orderRowsPerPage = 8;
  const [orderPage, setOrderPage] = useState(1);
  const totalOrderPages = Math.max(1, Math.ceil(orderRows.length / orderRowsPerPage));
  const safeOrderPage = Math.min(orderPage, totalOrderPages);
  const orderPageStart = (safeOrderPage - 1) * orderRowsPerPage;
  const orderPageEnd = Math.min(orderPageStart + orderRowsPerPage, orderRows.length);

  useEffect(() => {
    if (orderPage !== safeOrderPage) setOrderPage(safeOrderPage);
  }, [orderPage, safeOrderPage]);

  // Enhanced state for production features
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [avatar, setAvatar] = useState(initialData?.avatar || '');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showPreferredDaysDropdown, setShowPreferredDaysDropdown] = useState(false);
  const [showImportOrders, setShowImportOrders] = useState(false);
  const [selectedOrderRows, setSelectedOrderRows] = useState<Set<number>>(new Set());
  const [orderProductCatalog, setOrderProductCatalog] = useState<BuyerCatalogProduct[]>([]);
  const [addressPin, setAddressPin] = useState<MapCoordinates | null>(null);
  const [locatingAddress, setLocatingAddress] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const preferredDaysDropdownRef = useRef<HTMLDivElement>(null);
  const orderRowsEditedRef = useRef(false);
  const hydratedMarketplaceBuyerKeyRef = useRef('');

  // Load catalog products, variants and each product's configured stock levels.
  useEffect(() => {
    if (!user?.id) {
      setOrderProductCatalog([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const all: BuyerCatalogProduct[] = [];
        let page = 1;
        let totalPages = 1;
        do {
          const data = await fetchGraphQL<{
            products: { nodes: BuyerCatalogProduct[]; pagination?: { totalPages?: number } };
          }>(
            `query BuyerOrderCatalog($userId: Int!, $page: Int!, $limit: Int!) {
              products(userId: $userId, page: $page, limit: $limit) {
                nodes { productId name stockLevels sellingPriceUnit variantOptions { id variantName sku sellingPrice isActive } }
                pagination { totalPages }
              }
            }`,
            { userId: user.id, page, limit: 1000 },
          );
          all.push(...(data.products?.nodes || []));
          totalPages = Math.max(1, data.products?.pagination?.totalPages ?? 1);
          page += 1;
        } while (!cancelled && page <= totalPages);
        if (!cancelled) setOrderProductCatalog(all);
      } catch {
        if (!cancelled) setOrderProductCatalog([]);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  // Marketplace order lines and their immutable catalog snapshots are included
  // in the initial Buyer query. Expand the saved summaries synchronously instead
  // of fetching each order after the modal opens.
  useEffect(() => {
    if (!isEditMode || !initialData?.buyerId || !initialData.orderDetails || !initialData.orderLineDetails) return;
    const hydrationKey = `${initialData.buyerId}:${initialData.orderDetails}:${initialData.orderLineDetails}`;
    if (hydratedMarketplaceBuyerKeyRef.current === hydrationKey || orderRowsEditedRef.current) return;

    let sourceRows: OrderDetail[];
    type InitialOrderLines = {
      orderNo: string;
      orderDate: string;
      totalSpend: string;
      shippingFee: string | null;
      outstanding: string;
      orderItems: MarketplaceOrderLineForBuyer[];
    };
    let initialOrderLines: InitialOrderLines[];
    try {
      const parsedRows: unknown = JSON.parse(initialData.orderDetails);
      const parsedLines: unknown = JSON.parse(initialData.orderLineDetails);
      if (!Array.isArray(parsedRows) || !Array.isArray(parsedLines)) return;
      sourceRows = parsedRows as OrderDetail[];
      initialOrderLines = parsedLines as InitialOrderLines[];
    } catch {
      return;
    }

    const linesByOrder = new Map(initialOrderLines.map((order) => [String(order.orderNo || '').trim(), order]));
    const groupedRows = new Map<string, OrderDetail[]>();
    const result: OrderDetail[] = [];

    for (const row of sourceRows) {
      const orderNo = String(row.orderNo || '').trim();
      if (orderNo && (row.syncedFromOrders || isMarketplaceOrderNo(orderNo))) {
        const group = groupedRows.get(orderNo) || [];
        group.push(row);
        groupedRows.set(orderNo, group);
      } else {
        result.push(row);
      }
    }

    for (const [orderNo, group] of groupedRows) {
      const order = linesByOrder.get(orderNo);
      if (!order?.orderItems?.length) {
        result.push(...group);
        continue;
      }
      const representative = group[0];
      const overallSpend = group.reduce((sum, row) => sum + parseBuyerAmount(row.totalSpend), 0);
      const overallOutstanding = group.reduce((sum, row) => sum + parseBuyerAmount(row.outstanding), 0);
      const overallShipping = group.reduce((sum, row) => sum + parseBuyerAmount(row.shippingFee), 0);
      const weights = order.orderItems.map((line) => Math.max(0, Number(line.subtotal) || 0));
      const weightTotal = weights.reduce((sum, value) => sum + value, 0);
      const fallbackShare = 1 / order.orderItems.length;

      result.push(...order.orderItems.map((line, index): OrderDetail => {
        const share = weightTotal > 0 ? weights[index] / weightTotal : fallbackShare;
        const packageQuantity = Math.max(0, Number(line.packageQuantity) || 0);
        const piecesPerPackage = Math.max(1, Number(line.piecesPerPackage) || 1);
        const stockType = String(line.packageType || 'Pieces');
        let freePieces = 0;
        if (line.promotionDetailsSnapshot) {
          try {
            const promotionDetails = JSON.parse(line.promotionDetailsSnapshot) as import('@/utils/promotionUtils').PromotionDetails;
            const gift = calculatePromotionGift(promotionDetails, packageQuantity * piecesPerPackage, line.moqSnapshot ?? null);
            freePieces = Math.max(0, Number(gift?.freeQty) || 0);
          } catch {
            // Retain paid quantity when a historical promotion snapshot is malformed.
          }
        }
        const displayQuantity = packageQuantity + freePieces / piecesPerPackage;
        return {
          orderNo,
          product: String(line.productName || representative.product || ''),
          productId: line.productId || undefined,
          variantOptionId: (line.variantOptionId ?? line.variantId) == null
            ? undefined
            : String(line.variantOptionId ?? line.variantId),
          variantName: line.variantNameSnapshot || '',
          sku: line.productSkuSnapshot || '',
          pricePerPackage: line.pricePerPackage == null ? '' : String(line.pricePerPackage),
          stockType,
          piecesPerPackage,
          totalOrders: formatBuyerOrderTotal(String(displayQuantity), stockType),
          totalSpend: formatBuyerAmount(overallSpend * share),
          shippingFee: formatBuyerAmount(overallShipping * share),
          lastOrderDate: representative.lastOrderDate || order.orderDate || '',
          outstanding: formatBuyerAmount(overallOutstanding * share),
          syncedFromOrders: true,
        };
      }));
    }

    setOrderRows(result);
    hydratedMarketplaceBuyerKeyRef.current = hydrationKey;
  }, [isEditMode, initialData?.buyerId, initialData?.orderDetails, initialData?.orderLineDetails]);


  const getBuyerProduct = useCallback((productId?: string) =>
    orderProductCatalog.find((product) => product.productId === String(productId || '')),
  [orderProductCatalog]);

  // Resolve the selected SKU/variant from the canonical catalog identity first.
  // Legacy text is only a fallback and must identify exactly one variant.
  const getBuyerVariantForRow = useCallback((row: OrderDetail) => {
    const product = getBuyerProduct(row.productId);
    const variants = product?.variantOptions || [];
    const byId = variants.find((variant) => String(variant.id) === String(row.variantOptionId || ''));
    if (byId) return byId;

    const sku = String(row.sku || '').trim().toLocaleLowerCase();
    if (sku) {
      const skuMatches = variants.filter((variant) => String(variant.sku || '').trim().toLocaleLowerCase() === sku);
      if (skuMatches.length === 1) return skuMatches[0];
    }

    const variantName = String(row.variantName || '').trim().toLocaleLowerCase();
    if (variantName) {
      const nameMatches = variants.filter((variant) => String(variant.variantName || '').trim().toLocaleLowerCase() === variantName);
      if (nameMatches.length === 1) return nameMatches[0];
    }
    return undefined;
  }, [getBuyerProduct]);

  const orderSkuDropdownOptions = useMemo(() => orderProductCatalog.flatMap((product) =>
    (product.variantOptions || [])
      .filter((variant) => variant.isActive !== false && String(variant.sku || '').trim())
      .map((variant) => {
        const sku = String(variant.sku || '').trim();
        const description = `${String(product.name || '').trim()} · ${String(variant.variantName || '').trim()}`;
        return {
          value: String(variant.id),
          productId: product.productId,
          sku,
          // The closed selector displays only the SKU, matching SupplierModal.
          label: sku,
          // Keep product and variant searchable without putting them on the SKU line.
          searchText: description,
          description,
        };
      }),
  ), [orderProductCatalog]);

  const getBuyerProductStockLevels = useCallback((productId?: string): StockLevel[] => {
    const levels = getBuyerProduct(productId)?.stockLevels || [];
    const valid = levels.filter((level) => level && String(level.name || '').trim());
    return valid.length ? valid : [{ name: 'Pieces', piecesPerUnit: 1 }];
  }, [getBuyerProduct]);

  // Variant selling prices are stored per Piece. For a new manual row, derive
  // the package price from the current catalog. Once a total has been entered,
  // use totalSpend / quantity as the saved historical package price so older
  // prices remain editable and are not silently replaced by today's catalog price.
  const getBuyerPricePerPackage = useCallback((row: OrderDetail): number | null => {
    const explicitPackagePrice = String(row.pricePerPackage ?? '').trim();
    if (explicitPackagePrice !== '') {
      const parsedExplicitPrice = parseBuyerAmount(explicitPackagePrice);
      if (Number.isFinite(parsedExplicitPrice) && parsedExplicitPrice >= 0) return parsedExplicitPrice;
    }
    const parsed = parseBuyerOrderTotal(row.totalOrders || '', row.stockType || 'Pieces');
    const quantity = Number(parsed.quantity);
    const storedSpend = String(row.totalSpend ?? '').trim();
    if (!row.syncedFromOrders && !isMarketplaceOrderNo(row.orderNo) && storedSpend !== '' && !parsed.isMixed && Number.isFinite(quantity) && quantity > 0) {
      const historicalPackagePrice = parseBuyerAmount(storedSpend) / quantity;
      if (Number.isFinite(historicalPackagePrice) && historicalPackagePrice >= 0) return historicalPackagePrice;
    }

    if (!row.productId || row.variantOptionId == null || String(row.variantOptionId).trim() === '') return null;
    const variant = getBuyerProduct(row.productId)?.variantOptions?.find(
      (option) => String(option.id) === String(row.variantOptionId),
    );
    if (!variant) return null;
    const pricePerPiece = Number(variant.sellingPrice);
    if (!Number.isFinite(pricePerPiece) || pricePerPiece < 0) return null;
    const unitName = String(row.stockType || parsed.unit || 'Pieces');
    const level = getBuyerProductStockLevels(row.productId).find(
      (candidate) => candidate.name.toLowerCase() === unitName.toLowerCase(),
    );
    const piecesPerPackage = Math.max(1, Number(level?.piecesPerUnit) || Number(row.piecesPerPackage) || 1);
    return pricePerPiece * piecesPerPackage;
  }, [getBuyerProduct, getBuyerProductStockLevels]);

  // Marketplace rows preserve their historical order spend. Manual rows store
  // the entered package price through their calculated totalSpend value.
  const getBuyerCalculatedSpend = useCallback((row: OrderDetail): string => {
    if (row.syncedFromOrders || isMarketplaceOrderNo(row.orderNo)) return String(row.totalSpend || '');
    // Existing/imported manual spend is historical data. Keep it unless the
    // user changes product/variant or edits the package price/quantity.
    if (String(row.totalSpend ?? '').trim() !== '') return String(row.totalSpend);
    const pricePerPackage = getBuyerPricePerPackage({ ...row, totalSpend: '' });
    if (pricePerPackage === null) return '';
    const parsed = parseBuyerOrderTotal(row.totalOrders || '', row.stockType || 'Pieces');
    if (parsed.isMixed) return String(row.totalSpend || '');
    const quantity = Number(parsed.quantity);
    if (!Number.isFinite(quantity) || quantity < 0) return String(row.totalSpend || '');
    return formatBuyerAmount(quantity * pricePerPackage);
  }, [getBuyerPricePerPackage]);

  const selectedPreferredDays = useMemo(
    () => parsePreferredDays(form.preferredDays || ''),
    [form.preferredDays],
  );

  // Function to get the latest order date
  const getLatestOrderDate = useCallback((rows: OrderDetail[]) => {
    if (!rows || rows.length === 0) return '';
    const dates = rows
      .map(row => row.lastOrderDate)
      .filter(date => date && date.trim() !== '')
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    return dates.length > 0 ? dates[0] : '';
  }, []);

  // Compute lastShipment during render (not in useEffect) - follows React best practices
  // Use computed value directly instead of storing in state
  const computedLastShipment = useMemo(() => {
    return getLatestOrderDate(orderRows);
  }, [orderRows, getLatestOrderDate]);

  const placeAddressOnMap = useCallback(async (address: string) => {
    const trimmed = address.trim();
    if (!trimmed) return;
    setLocatingAddress(true);
    try {
      const found = await geocodeAddress(trimmed);
      if (found.coordinates) setAddressPin(found.coordinates);
    } finally {
      setLocatingAddress(false);
    }
  }, []);

  const onAddressMapClick = useCallback((coordinates: MapCoordinates) => {
    setAddressPin(coordinates);
    void (async () => {
      try {
        const response = await fetch('/api/mobile/geocode/reverse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ latitude: coordinates.latitude, longitude: coordinates.longitude }),
        });
        const data = (await response.json()) as { address?: string };
        if (typeof data.address === 'string' && data.address.trim()) {
          setForm((f) => ({ ...f, address: data.address!.trim() }));
          setValidationErrors((prev) => clearValidationField(prev, 'address'));
        }
      } catch {
        // Pin still marks the chosen point even if reverse geocode fails.
      }
    })();
  }, []);

  const translateWeekday = useCallback(
    (day: Weekday) => {
      const key = `days.${day}`;
      if (typeof tBuyersModal.has === 'function') {
        return tBuyersModal.has(key) ? tBuyersModal(key) : day;
      }
      return tBuyersModal(key);
    },
    [tBuyersModal],
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

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(target)) {
        setShowStatusDropdown(false);
      }
      if (preferredDaysDropdownRef.current && !preferredDaysDropdownRef.current.contains(target)) {
        setShowPreferredDaysDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const validateForm = useCallback(() => {
    const errors: Record<string, string> = {};

    const storeNameResult = validateRequiredField(form.storeName, tBuyersModal('storeName'));
    const ownerResult = validateRequiredField(form.owner, tBuyersModal('ownerName'));
    const phoneResult = validateRequiredPhone(form.phone);
    const emailResult = validateOptionalEmail(form.email);
    const addressResult = validateRequiredField(form.address, tBuyersModal('address'));

    if (!storeNameResult.valid && storeNameResult.error) errors.storeName = storeNameResult.error;
    if (!ownerResult.valid && ownerResult.error) errors.owner = ownerResult.error;
    if (!phoneResult.valid && phoneResult.error) errors.phone = phoneResult.error;
    if (!emailResult.valid && emailResult.error) errors.email = emailResult.error;
    if (!addressResult.valid && addressResult.error) errors.address = addressResult.error;

    setValidationErrors(errors);
    setSubmitAttempted(true);
    return Object.keys(errors).length === 0;
  }, [form.storeName, form.owner, form.phone, form.email, form.address, tBuyersModal, getBuyerProductStockLevels]);

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

  // Enhanced order row management
  const handleOrderChange = useCallback((idx: number, field: keyof OrderDetail, value: string) => {
    orderRowsEditedRef.current = true;
    setOrderRows((rows: OrderDetail[]) => rows.map((row: OrderDetail, i: number) => i === idx ? { ...row, [field]: value } : row));
  }, []);

  const addOrderRow = useCallback(() => {
    orderRowsEditedRef.current = true;
    setOrderRows((rows: OrderDetail[]) => [...rows, { orderNo: '', product: '', productId: '', variantOptionId: '', variantName: '', stockType: 'Pieces', totalOrders: '', totalSpend: '', shippingFee: '', lastOrderDate: '', outstanding: '' }]);
    setOrderPage(Math.max(1, Math.ceil((orderRows.length + 1) / orderRowsPerPage)));
  }, [orderRows.length]);

  const handleOrderProductSelect = useCallback((idx: number, productId: string) => {
    orderRowsEditedRef.current = true;
    const product = getBuyerProduct(productId);
    const firstLevel = getBuyerProductStockLevels(productId)[0] || { name: 'Pieces', piecesPerUnit: 1 };
    setOrderRows((rows) => rows.map((row, index) => index !== idx ? row : {
      ...row,
      productId,
      product: product?.name || '',
      variantOptionId: '',
      variantName: '',
      sku: '',
      stockType: firstLevel.name,
      piecesPerPackage: firstLevel.piecesPerUnit,
      totalOrders: row.totalOrders ? formatBuyerOrderTotal(parseBuyerOrderTotal(row.totalOrders, 'Pieces').quantity, firstLevel.name) : '',
      totalSpend: '',
      pricePerPackage: '',
    }));
  }, [getBuyerProduct, getBuyerProductStockLevels]);

  const handleOrderVariantSelect = useCallback((idx: number, variantId: string) => {
    orderRowsEditedRef.current = true;
    setOrderRows((rows) => rows.map((row, index) => {
      if (index !== idx) return row;
      const variant = getBuyerProduct(row.productId)?.variantOptions?.find((option) => String(option.id) === variantId);
      const nextRow = { ...row, variantOptionId: variantId, variantName: variant?.variantName || '', sku: variant?.sku || '', pricePerPackage: '', totalSpend: '' };
      return { ...nextRow, totalSpend: getBuyerCalculatedSpend(nextRow) };
    }));
  }, [getBuyerProduct, getBuyerCalculatedSpend]);

  // SKU selection also selects its owning product and VariantOption. We use the
  // variant ID as the option value so reused SKUs cannot collide in the picker.
  const handleOrderSkuSelect = useCallback((idx: number, variantId: string) => {
    orderRowsEditedRef.current = true;
    const match = orderProductCatalog.flatMap((product) =>
      (product.variantOptions || []).map((variant) => ({ product, variant })),
    ).find(({ variant }) => String(variant.id) === variantId);
    if (!match) return;

    const levels = getBuyerProductStockLevels(match.product.productId);
    setOrderRows((rows) => rows.map((row, index) => {
      if (index !== idx) return row;
      const currentUnit = String(row.stockType || '').trim();
      const selectedLevel = levels.find((level) => level.name.toLocaleLowerCase() === currentUnit.toLocaleLowerCase()) || levels[0];
      const nextRow: OrderDetail = {
        ...row,
        product: match.product.name,
        productId: match.product.productId,
        variantOptionId: String(match.variant.id),
        variantName: match.variant.variantName,
        sku: match.variant.sku || '',
        stockType: selectedLevel?.name || 'Pieces',
        piecesPerPackage: selectedLevel?.piecesPerUnit || 1,
        pricePerPackage: '',
        totalSpend: '',
      };
      return { ...nextRow, totalSpend: getBuyerCalculatedSpend(nextRow) };
    }));
  }, [orderProductCatalog, getBuyerProductStockLevels, getBuyerCalculatedSpend]);

  const handleOrderQuantityChange = useCallback((idx: number, quantity: string) => {
    orderRowsEditedRef.current = true;
    setOrderRows((rows) => rows.map((row, i) => {
      if (i !== idx) return row;
      const parsed = parseBuyerOrderTotal(row.totalOrders, row.stockType || 'Pieces');
      if (parsed.isMixed) return row;
      const packagePrice = getBuyerPricePerPackage(row);
      const numericQuantity = Number(quantity);
      const nextRow = { ...row, totalOrders: formatBuyerOrderTotal(quantity, row.stockType || parsed.unit) };
      return {
        ...nextRow,
        totalSpend: packagePrice !== null && quantity.trim() !== '' && Number.isFinite(numericQuantity) && numericQuantity >= 0
          ? formatBuyerAmount(numericQuantity * packagePrice)
          : '',
      };
    }));
  }, [getBuyerPricePerPackage]);

  const handleOrderUnitChange = useCallback((idx: number, unit: string) => {
    orderRowsEditedRef.current = true;
    setOrderRows((rows) => rows.map((row, i) => {
      if (i !== idx) return row;
      const parsed = parseBuyerOrderTotal(row.totalOrders, row.stockType || 'Pieces');
      if (parsed.isMixed) return row;
      const selectedLevel = getBuyerProductStockLevels(row.productId).find((level) => level.name === unit);
      const previousPiecesPerPackage = Math.max(1, Number(row.piecesPerPackage) || 1);
      const nextPiecesPerPackage = Math.max(1, Number(selectedLevel?.piecesPerUnit) || 1);
      const previousPackagePrice = getBuyerPricePerPackage(row);
      const nextPackagePrice = previousPackagePrice === null
        ? null
        : previousPackagePrice / previousPiecesPerPackage * nextPiecesPerPackage;
      const quantity = Number(parsed.quantity);
      const nextRow = {
        ...row,
        stockType: unit,
        piecesPerPackage: nextPiecesPerPackage,
        pricePerPackage: nextPackagePrice == null ? '' : String(nextPackagePrice),
        totalOrders: formatBuyerOrderTotal(parsed.quantity, unit),
      };
      return {
        ...nextRow,
        totalSpend: nextPackagePrice !== null && Number.isFinite(quantity)
          ? formatBuyerAmount(quantity * nextPackagePrice)
          : '',
      };
    }));
  }, [getBuyerProductStockLevels, getBuyerPricePerPackage]);

  const handleOrderPricePerPackageChange = useCallback((idx: number, priceValue: string) => {
    orderRowsEditedRef.current = true;
    setOrderRows((rows) => rows.map((row, i) => {
      if (i !== idx) return row;
      const parsed = parseBuyerOrderTotal(row.totalOrders, row.stockType || 'Pieces');
      const price = priceValue.trim() === '' ? null : Number(priceValue);
      const quantity = Number(parsed.quantity);
      return {
        ...row,
        pricePerPackage: priceValue,
        totalSpend: price !== null && Number.isFinite(price) && price >= 0 && !parsed.isMixed && Number.isFinite(quantity)
          ? formatBuyerAmount(quantity * price)
          : '',
      };
    }));
  }, []);

  const deleteOrderRow = useCallback((idx: number) => {
    orderRowsEditedRef.current = true;
    setOrderRows((rows: OrderDetail[]) => {
      // The last visible row is the editable placeholder, not a persisted record.
      if (rows.length <= 1) return [{ orderNo: '', product: '', productId: '', variantOptionId: '', variantName: '', stockType: 'Pieces', totalOrders: '', totalSpend: '', shippingFee: '', lastOrderDate: '', outstanding: '' }];
      return rows.filter((_: OrderDetail, i: number) => i !== idx);
    });
    setSelectedOrderRows(new Set());
  }, []);

  const allOrderRowsSelected = orderRows.length > 0 && selectedOrderRows.size === orderRows.length;
  const someOrderRowsSelected = selectedOrderRows.size > 0 && !allOrderRowsSelected;

  const toggleOrderRowSelection = useCallback((idx: number) => {
    setSelectedOrderRows((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const toggleAllOrderRowSelection = useCallback(() => {
    setSelectedOrderRows(
      allOrderRowsSelected ? new Set() : new Set(orderRows.map((_, i) => i)),
    );
  }, [allOrderRowsSelected, orderRows]);

  const handleBulkDeleteOrders = useCallback(() => {
    orderRowsEditedRef.current = true;
    setOrderRows((rows) => {
      const remaining = rows.filter((_, i) => !selectedOrderRows.has(i));
      return remaining.length > 0 ? remaining : [{ orderNo: '', product: '', productId: '', variantOptionId: '', variantName: '', stockType: 'Pieces', totalOrders: '', totalSpend: '', shippingFee: '', lastOrderDate: '', outstanding: '' }];
    });
    setSelectedOrderRows(new Set());
  }, [selectedOrderRows]);

  const handleExportOrders = useCallback(() => {
    const headers = ['Product', 'SKU', 'Variant', 'Total Orders', 'Stock Type', 'Price / Pckg', 'Total Spend', 'Total Outstanding', 'Last Order Date'];
    const rows = orderRows
      .filter((row) => !isBlankOrderRow(row))
      .map((row) => [
        row.product || '',
        row.sku || getBuyerProduct(row.productId)?.variantOptions?.find((variant) => String(variant.id) === String(row.variantOptionId || ''))?.sku || '',
        row.variantName || '',
        row.totalOrders || '',
        row.stockType || parseBuyerOrderTotal(row.totalOrders || '', 'Pieces').unit,
        getBuyerPricePerPackage(row) ?? '',
        getBuyerCalculatedSpend(row),
        row.outstanding || '',
        row.lastOrderDate || '',
      ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Orders');
    XLSX.writeFile(wb, `${form.storeName || id || 'buyer'}-orders.xlsx`);
  }, [orderRows, form.storeName, id, getBuyerPricePerPackage, getBuyerCalculatedSpend, getBuyerProduct]);

  // Imported orders are appended to the table; nothing is saved until the form is saved.
  const handleImportOrders = useCallback((newOrders: OrderDetail[]) => {
    orderRowsEditedRef.current = true;
    const imported: OrderDetail[] = newOrders.map((row) => {
      const importedRow: OrderDetail = {
        orderNo: '',
        product: String(row.product || ''),
        productId: row.productId,
        variantOptionId: row.variantOptionId,
        variantName: row.variantName,
        sku: row.sku || '',
        pricePerPackage: row.pricePerPackage == null ? '' : String(row.pricePerPackage),
        stockType: row.stockType || parseBuyerOrderTotal(String(row.totalOrders || ''), 'Pieces').unit,
        piecesPerPackage: Number(row.piecesPerPackage) > 0 ? Number(row.piecesPerPackage) : undefined,
        totalOrders: normalizeBuyerOrderTotal(String(row.totalOrders || ''), row.stockType || 'Pieces'),
        totalSpend: String(row.totalSpend || ''),
        shippingFee: '',
        lastOrderDate: String(row.lastOrderDate || ''),
        outstanding: String(row.outstanding || ''),
      };
      return { ...importedRow, totalSpend: getBuyerCalculatedSpend(importedRow) };
    });
    setOrderRows((rows) => {
      const merged = [...rows.filter((row) => !isBlankOrderRow(row)), ...imported];
      return merged.length > 0
        ? merged
        : [{ orderNo: '', product: '', productId: '', variantOptionId: '', variantName: '', stockType: 'Pieces', totalOrders: '', totalSpend: '', shippingFee: '', lastOrderDate: '', outstanding: '' }];
    });
    const existingCount = orderRows.filter((row) => !isBlankOrderRow(row)).length;
    if (imported.length > 0) {
      setOrderPage(Math.max(1, Math.ceil((existingCount + imported.length) / orderRowsPerPage)));
    }
    // Blank rows are dropped on import, which shifts indices.
    setSelectedOrderRows(new Set());
    setShowImportOrders(false);
  }, [getBuyerCalculatedSpend, orderRows]);

  // Enhanced form submission
  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (isSubmitting || showSuccessModal) return;

    setError('');
    setSuccess('');

    if (!validateForm()) return;

    setIsSubmitting(true);
    setSaving(true);
    
    try {
      const payload: Record<string, unknown> = {
        ...form,
        avatar,
        buyerId: id,
        // Empty/placeholder rows are not buyer transactions. [] explicitly
        // clears all manual buyer records without deleting the buyer.
        orderDetails: JSON.stringify(orderRows.filter((row) =>
          Boolean(String(row.orderNo || '').trim() ||
            String(row.product || '').trim() ||
            String(row.sku || '').trim() ||
            String(row.variantOptionId || '').trim() ||
            String(row.totalOrders || '').trim() ||
            String(row.lastOrderDate || '').trim()),
        ).map((row) => {
          const selectedLevel = getBuyerProductStockLevels(row.productId).find((level) => level.name === (row.stockType || parseBuyerOrderTotal(row.totalOrders, 'Pieces').unit));
          return {
            ...row,
            totalSpend: getBuyerCalculatedSpend(row),
            piecesPerPackage: Number(row.piecesPerPackage) > 0 ? Number(row.piecesPerPackage) : selectedLevel?.piecesPerUnit || 1,
          };
        })),
        notes: JSON.stringify((form.notes || '').split(',').map((n: string) => n.trim()).filter(Boolean)),
        createdAt: isEditMode ? (form.createdAt ? new Date(form.createdAt).toISOString() : new Date().toISOString()) : new Date().toISOString(),
        logistics: JSON.stringify({
          preferredDays: form.preferredDays || '',
          lastShipment: computedLastShipment || '',
          lastVisit: form.lastVisit || '',
          shipmentSuccess: form.shipmentSuccess || ''
        }),
        userId: user?.id,
      };
      
      if (isEditMode && initialData && typeof initialData.id === 'number') {
        payload.id = initialData.id;
      }
      
      // Remove fields that are not part of the API payload
      delete payload.preferredDays;
      delete payload.lastShipment;
      delete payload.lastVisit;
      delete payload.shipmentSuccess;
      
      let savedBuyer: Buyer | null = null;
      
      if (isEditMode) {
        const UPDATE_BUYER_MUTATION = `
          mutation UpdateBuyer(
            $userId: Int!
            $id: String
            $buyerId: String
            $storeName: String
            $owner: String
            $email: String
            $phone: String
            $businessType: String
            $address: String
            $status: String
            $avatar: String
            $logistics: String
            $notes: String
            $orderDetails: String
          ) {
            updateBuyer(
              userId: $userId
              id: $id
              buyerId: $buyerId
              storeName: $storeName
              owner: $owner
              email: $email
              phone: $phone
              businessType: $businessType
              address: $address
              status: $status
              avatar: $avatar
              logistics: $logistics
              notes: $notes
              orderDetails: $orderDetails
            ) {
              id
              buyerId
              avatar
              owner
              storeName
              email
              phone
              businessType
              address
              status
              logistics
              notes
              orderDetails
              avgMonthlySpending
              avgMonthlyOrders
              userId
              createdAt
              updatedAt
            }
          }
        `;
        
        const data = await fetchGraphQL<{ updateBuyer: Buyer }>(UPDATE_BUYER_MUTATION, {
          userId: user?.id,
          id: initialData?.buyerId || initialData?.id?.toString(),
          buyerId: payload.buyerId,
          storeName: payload.storeName,
          owner: payload.owner,
          email: payload.email,
          phone: payload.phone,
          businessType: payload.businessType,
          address: payload.address,
          status: payload.status,
          avatar: payload.avatar,
          logistics: payload.logistics,
          notes: payload.notes,
          orderDetails: payload.orderDetails,
      });
      
        savedBuyer = data.updateBuyer;
        onSave?.(savedBuyer as unknown as BuyerFormData);
      } else {
        const CREATE_BUYER_MUTATION = `
          mutation CreateBuyer(
            $userId: Int!
            $buyerId: String
            $storeName: String
            $owner: String
            $email: String
            $phone: String
            $businessType: String
            $address: String
            $status: String
            $avatar: String
            $logistics: String
            $notes: String
            $orderDetails: String
          ) {
            createBuyer(
              userId: $userId
              buyerId: $buyerId
              storeName: $storeName
              owner: $owner
              email: $email
              phone: $phone
              businessType: $businessType
              address: $address
              status: $status
              avatar: $avatar
              logistics: $logistics
              notes: $notes
              orderDetails: $orderDetails
            ) {
              id
              buyerId
              avatar
              owner
              storeName
              email
              phone
              businessType
              address
              status
              logistics
              notes
              orderDetails
              avgMonthlySpending
              avgMonthlyOrders
              userId
              createdAt
              updatedAt
            }
          }
        `;
        
        const data = await fetchGraphQL<{ createBuyer: Buyer }>(CREATE_BUYER_MUTATION, {
          userId: user?.id,
          buyerId: payload.buyerId,
          storeName: payload.storeName,
          owner: payload.owner,
          email: payload.email,
          phone: payload.phone,
          businessType: payload.businessType,
          address: payload.address,
          status: payload.status,
          avatar: payload.avatar,
          logistics: payload.logistics,
          notes: payload.notes,
          orderDetails: payload.orderDetails,
        });
        
        savedBuyer = data.createBuyer;
        onSave?.(savedBuyer as unknown as BuyerFormData);
      }

      const routeId = savedBuyer?.buyerId || String(payload.buyerId || '');
      setShowSuccessModal(true);
      setTimeout(() => {
        setShowSuccessModal(false);
        if (routeId) {
          router.push(`/clients/buyers/details/${encodeURIComponent(routeId)}`);
        } else {
          router.push('/clients/buyers');
        }
      }, 1200);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : tBuyersModal('saveFailed');
      const field = mapBuyerFieldError(errorMessage);
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
  }, [form, avatar, id, orderRows, isEditMode, initialData, user?.id, onSave, router, validateForm, handleError, isSubmitting, showSuccessModal, tBuyersModal, getBuyerProductStockLevels, getBuyerCalculatedSpend]);

  // Enhanced file handling
  const handleFileUpload = useCallback(async (file: File) => {
    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      handleError(tBuyersModal('fileTooLarge'));
      return;
    }
    
    if (!file.type.startsWith('image/')) {
      handleError(tBuyersModal('invalidImage'));
      return;
    }
    
    try {
      // Direct upload to Cloudinary (faster, no base64 conversion)
      const result = await uploadToCloudinaryDirect(file, 'buyers');

      if (result.success && result.url) {
        setAvatar(result.url);
      } else {
        throw new Error(result.error || 'Upload failed');
      }
    } catch (error) {
      handleError(error instanceof Error ? error.message : tBuyersModal('uploadFailed'));
    }
  }, [handleError]);

  // Hydrate form when initialData is provided (edit or AI prefill on add)
  useEffect(() => {
    if (!initialData) return;

    const parsedNotes = safeParseJSON(initialData.notes || '', []);
    const parsedLogistics = safeParseJSON(initialData.logistics || '', {});

    const orderDetails = initialData?.orderDetails ? (() => {
      try {
        const parsed = JSON.parse(initialData.orderDetails);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })() : [];

    const latestOrderDate = getLatestOrderDate(orderDetails);

    setForm({
      storeName: initialData.storeName && !initialData.storeName.includes('Missing') ? initialData.storeName : '',
      owner: initialData.owner && !initialData.owner.includes('Missing') ? initialData.owner : '',
      phone: initialData.phone && !initialData.phone.includes('Missing') ? initialData.phone : '',
      email: initialData.email && !initialData.email.includes('Missing') ? initialData.email : '',
      address: initialData.address && !initialData.address.includes('Missing') ? initialData.address : '',
      businessType: initialData.businessType && !initialData.businessType.includes('Missing') ? initialData.businessType : '',
      status: initialData.status || (isEditMode ? statusOptions[0] : 'Prospect'),
      createdAt: initialData.createdAt ? new Date(initialData.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      preferredDays: parsedLogistics.preferredDays && !parsedLogistics.preferredDays.includes('Missing') ? parsedLogistics.preferredDays : '',
      lastShipment: latestOrderDate || (parsedLogistics.lastShipment && !parsedLogistics.lastShipment.includes('Missing') ? parsedLogistics.lastShipment : ''),
      lastVisit: parsedLogistics.lastVisit && !String(parsedLogistics.lastVisit).includes('Missing') ? String(parsedLogistics.lastVisit) : '',
      shipmentSuccess: parsedLogistics.shipmentSuccess && !parsedLogistics.shipmentSuccess.includes('Missing') ? parsedLogistics.shipmentSuccess : '',
      notes: Array.isArray(parsedNotes) ? parsedNotes.join(', ') : '',
    });
    setId(isEditMode ? (initialData.buyerId || generateSecureBuyerId()) : generateSecureBuyerId());
    // Marketplace orders are expanded from immutable OrderItem snapshots by the
    // dedicated hydration effect. Do not overwrite those line-level rows with the
    // consolidated one-row-per-order BuyerRecord summary here.
    if (!initialData.orderLineDetails) {
      setOrderRows(
        orderDetails.length > 0 ? orderDetails.map((row: OrderDetail) => ({
          orderNo: row.orderNo || '',
          product: row.product || '',
          productId: row.productId || '',
          variantOptionId: row.variantOptionId == null ? '' : String(row.variantOptionId),
          variantName: row.variantName || '',
          sku: row.sku || '',
          pricePerPackage: row.pricePerPackage == null ? '' : String(row.pricePerPackage),
          stockType: row.stockType || parseBuyerOrderTotal(row.totalOrders || '', 'Boxes').unit,
          piecesPerPackage: Number(row.piecesPerPackage) > 0 ? Number(row.piecesPerPackage) : undefined,
          totalOrders: normalizeBuyerOrderTotal(row.totalOrders || '', row.stockType || 'Boxes'),
          totalSpend: row.totalSpend || '',
          shippingFee: row.shippingFee || '',
          lastOrderDate: row.lastOrderDate || '',
          outstanding: row.outstanding || '',
          syncedFromOrders: row.syncedFromOrders === true,
        })) : [{ orderNo: '', product: '', productId: '', variantOptionId: '', variantName: '', stockType: 'Pieces', totalOrders: '', totalSpend: '', shippingFee: '', lastOrderDate: '', outstanding: '' }]
      );
    }
    setSelectedOrderRows(new Set());
    setAvatar(initialData.avatar || '');
    setValidationErrors({});
    setError('');
    setSuccess('');
    setSubmitAttempted(false);

    const nextAddress =
      initialData.address && !initialData.address.includes('Missing') ? initialData.address.trim() : '';
    if (nextAddress) {
      void placeAddressOnMap(nextAddress);
    } else {
      setAddressPin(null);
    }
  }, [initialData, isEditMode, safeParseJSON, getLatestOrderDate, placeAddressOnMap]);

  return (
    <>
      <div className="flex w-full min-w-0 flex-col overflow-visible rounded-lg border border-[#e6e6e6] bg-white">
        <div className="flex flex-col gap-3 border-b border-[#e6e6e6] p-4 @5xl/main:flex-row @5xl/main:items-center @5xl/main:justify-between">
          <div className="flex min-w-0 flex-col gap-3 @3xl/main:flex-row @3xl/main:items-center">
            <Link
              href={isEditMode && initialData?.buyerId ? `/clients/buyers/details/${encodeURIComponent(initialData.buyerId)}` : '/clients/buyers'}
              className="flex w-full shrink-0 items-center justify-center gap-2 rounded-lg px-3 py-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800 @3xl/main:w-auto @3xl/main:justify-start"
            >
              <ArrowLeft className="h-4 w-4" />
              {tBuyersModal('back')}
            </Link>
            <h1 id="buyer-form-title" className="truncate text-2xl font-bold text-gray-900">
              {isEditMode ? tBuyersModal('editTitle') : tBuyersModal('addTitle')}
            </h1>
          </div>
          <div className="flex w-full min-w-0 flex-col gap-2 @4xl/main:flex-row @4xl/main:flex-wrap @4xl/main:items-center @5xl/main:w-auto">
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0a61d7] px-4 py-2 font-semibold text-white transition-colors hover:bg-[#084ba6] disabled:cursor-not-allowed disabled:opacity-50 @4xl/main:w-auto"
              onClick={handleSubmit}
              disabled={saving || isSubmitting || showSuccessModal}
            >
              {saving ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  {tBuyersModal('saving')}
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  {tBuyersModal('save')}
                </>
              )}
            </button>
          </div>
        </div>
        
        {/* Enhanced Error/Success Messages */}
        {error && (
          <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <span className="text-red-700 text-sm">{error}</span>
          </div>
        )}
        
        {success && (
          <div className="mx-4 mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <span className="text-green-700 text-sm">{success}</span>
          </div>
        )}
        
        <form 
          ref={formRef}
          className="flex flex-col gap-2 px-4 py-4"
          onSubmit={handleSubmit}
        >
          {/* Avatar Section */}
          <div className="flex flex-col items-left mb-4 mt-4">
            <div className="flex items-center gap-3">
              <div className="w-18 h-18 rounded-full bg-gray-100 border flex items-center justify-center overflow-hidden mb-2">
                {avatar ? (
                  <img src={avatar} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-10 h-10 text-gray-400" />
                )}
              </div>
              <button
                type="button"
                className="ml-2 px-3 py-2 rounded-lg bg-[#0a61d7] text-white text-xs font-semibold hover:bg-[#084ba6] flex items-center gap-1 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-4 h-4" /> {tBuyersModal('uploadPhoto')}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />
            </div>
          </div>
          
          {/* ID Field */}
          <ClientField
            label={tShared('columns.id')}
            value={String(id ?? '')}
            onChange={(value) => setId(value)}
            disabled
            required
            hint={tBuyersModal('autoIdHint')}
            id="buyer-id"
            aria-describedby="buyer-id-hint"
          />
          
          {/* Store Name and Owner */}
          <div className="flex gap-2">
            <ClientField
              className="flex-1"
              label={tBuyersModal('storeName')}
              value={form.storeName || ''}
              onChange={(storeName) => {
                setForm((f) => ({ ...f, storeName }));
                setValidationErrors((prev) => clearValidationField(prev, 'storeName'));
              }}
              validator={(value) => validateRequiredField(value, tBuyersModal('storeName'))}
              submitAttempted={submitAttempted}
              externalError={validationErrors.storeName}
              required
            />
            <ClientField
              className="flex-1"
              label={tBuyersModal('ownerName')}
              value={form.owner || ''}
              onChange={(owner) => {
                setForm((f) => ({ ...f, owner }));
                setValidationErrors((prev) => clearValidationField(prev, 'owner'));
              }}
              validator={(value) => validateRequiredField(value, tBuyersModal('ownerName'))}
              submitAttempted={submitAttempted}
              externalError={validationErrors.owner}
              required
            />
          </div>
          
          {/* Phone and Email */}
          <div className="flex gap-2">
            <ClientValidatedField
              className="flex-1"
              label={tBuyersModal('phone')}
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
              label={tBuyersModal('email')}
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
          
          {/* Business Type and Status */}
          <div className="flex gap-2">
            <ClientField
              className="flex-1"
              label={tBuyersModal('businessType')}
              value={form.businessType || ''}
              onChange={(businessType) => setForm((f) => ({ ...f, businessType }))}
              placeholder={tBuyersModal('businessTypePlaceholder')}
            />
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">{tBuyersModal('status')}</label>
              <div className="relative" ref={statusDropdownRef}>
                <button
                  type="button"
                  onClick={() => {
                    setShowStatusDropdown((open) => !open);
                  }}
                  className={CLIENT_SELECT_BUTTON_CLASS}
                >
                  <span className={form.status ? 'text-black' : 'text-gray-500'}>
                    {form.status ? translateStatus(form.status) : tBuyersModal('selectStatus')}
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
          
          {/* Address + map */}
          <div>
            <ClientField
              label={tBuyersModal('address')}
              value={form.address || ''}
              onChange={(address) => {
                setForm((f) => ({ ...f, address }));
                setValidationErrors((prev) => clearValidationField(prev, 'address'));
              }}
              validator={(value) => validateRequiredField(value, tBuyersModal('address'))}
              submitAttempted={submitAttempted}
              externalError={validationErrors.address}
              required
              rows={3}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void placeAddressOnMap(form.address || '')}
                disabled={locatingAddress || !(form.address || '').trim()}
                className="rounded-lg border border-[#e6e6e6] bg-white px-3 py-2 text-xs font-medium text-black hover:bg-gray-100 disabled:opacity-60"
              >
                {tBuyersModal('findOnMap')}
              </button>
              <p className="text-xs text-gray-500">{tBuyersModal('mapHint')}</p>
            </div>
            <div className="mt-3 overflow-hidden rounded-lg border border-[#e6e6e6]">
              <MapComponent
                height="280px"
                zoom={addressPin ? 15 : 11}
                center={addressPin ?? JAKARTA}
                markers={
                  addressPin
                    ? [{ id: 'buyer-address', coordinates: addressPin, color: '#0a61d7' }]
                    : []
                }
                onMapClick={onAddressMapClick}
              />
            </div>
          </div>
          
          {/* Order & Product Details Table */}
          <div className="my-2 border-t border-gray-200 pt-2">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <label className="block text-sm font-bold text-black">{tBuyersModal('orderSection')}</label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="flex items-center gap-1 rounded-lg border border-[#e6e6e6] bg-white px-3 py-1.5 text-xs font-medium text-black transition hover:bg-gray-100"
                  onClick={() => setShowImportOrders(true)}
                >
                  <Upload className="h-3.5 w-3.5" /> {tBuyersProfile('importOrders')}
                </button>
                <button
                  type="button"
                  className="flex items-center gap-1 rounded-lg border border-[#e6e6e6] bg-white px-3 py-1.5 text-xs font-medium text-black transition hover:bg-gray-100"
                  onClick={handleExportOrders}
                >
                  <Download className="h-3.5 w-3.5" /> {tBuyersProfile('exportOrders')}
                </button>
              </div>
            </div>
            {selectedOrderRows.size > 0 && (
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#e6e6e6] border-l-4 border-l-green-500 bg-white p-3 shadow-sm">
                <span className="text-sm font-semibold text-green-700">
                  {tBuyersModal('orderRowsSelected', { count: selectedOrderRows.size })}
                </span>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
                  onClick={handleBulkDeleteOrders}
                >
                  <Trash className="h-4 w-4" /> {tBuyersModal('bulkDelete')}
                </button>
              </div>
            )}
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full text-xs font-medium text-left bg-white">
                <thead>
                  <tr className="text-gray-500 bg-gray-100 whitespace-nowrap">
                    <th className="w-12 py-2 px-3">
                      <ImportSelectionCheckbox
                        checked={allOrderRowsSelected}
                        indeterminate={someOrderRowsSelected}
                        onToggle={toggleAllOrderRowSelection}
                        ariaLabel={allOrderRowsSelected ? tBuyersModal('deselectAll') : tBuyersModal('selectAll')}
                      />
                    </th>
                    <th className="py-2 px-3 font-medium uppercase">{tBuyersModal('colNo')}</th>
                    <th className="py-2 px-3 font-medium uppercase">{tBuyersModal('colProduct')}</th>
                    <th className="py-2 px-3 font-medium uppercase">SKU</th>
                    <th className="py-2 px-3 font-medium uppercase">Variant</th>
                    <th className="py-2 px-3 font-medium uppercase">{tBuyersModal('colTotalOrders')}</th>
                    <th className="py-2 px-3 font-medium uppercase">Price / Pckg</th>
                    <th className="py-2 px-3 font-medium uppercase">{tBuyersModal('colTotalSpend')}</th>
                    <th className="py-2 px-3 font-medium uppercase">{tBuyersModal('colOutstanding')}</th>
                    <th className="py-2 px-3 font-medium uppercase">{tBuyersModal('colLastOrderDate')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {orderRows.slice(orderPageStart, orderPageEnd).map((row: OrderDetail, visibleIndex: number) => {
                    const idx = orderPageStart + visibleIndex;
                    return (
                    <tr key={idx} className="whitespace-nowrap">
                      <td className="py-2 px-3">
                        <ImportSelectionCheckbox
                          checked={selectedOrderRows.has(idx)}
                          onToggle={() => toggleOrderRowSelection(idx)}
                          ariaLabel={tImport('selectRow', { index: idx + 1 })}
                        />
                      </td>
                      <td className="py-2 px-3 font-medium text-black">{idx + 1}</td>
                      <td className="py-2 px-3">
                        <ClientCatalogSelect
                          value={row.productId || ''}
                          placeholder="Select product"
                          allowNone={false}
                          options={orderProductCatalog.map((product) => ({ value: product.productId, label: product.name }))}
                          onChange={(productId: string) => handleOrderProductSelect(idx, productId)}
                          searchPlaceholder="Search product..."
                        />
                      </td>
                      <td className="min-w-[13rem] py-2 px-3">
                        {(() => {
                          const skuOptions = orderSkuDropdownOptions.filter((option) =>
                            !row.productId || option.productId === row.productId,
                          );
                          return (
                            <ClientCatalogSelect
                              value={String(getBuyerVariantForRow(row)?.id || '')}
                              placeholder="Select SKU"
                              options={skuOptions}
                              allowNone={false}
                              onChange={(variantId: string) => handleOrderSkuSelect(idx, variantId)}
                              searchPlaceholder="Search SKU, product or variant..."
                              renderOption={(option) => (
                                <span className="flex flex-col gap-0.5">
                                  <span className="font-normal text-black">{option.label}</span>
                                  <span className="text-[10px] font-normal text-gray-500">{option.description || option.searchText}</span>
                                </span>
                              )}
                            />
                          );
                        })()}
                      </td>
                      <td className="py-2 px-3">
                        <ClientCatalogSelect
                          value={String(row.variantOptionId || '')}
                          placeholder={row.productId ? 'Select variant' : 'Select product first'}
                          options={(getBuyerProduct(row.productId)?.variantOptions || []).filter((variant) => variant.isActive !== false || String(variant.id) === String(row.variantOptionId || '')).map((variant) => ({ value: String(variant.id), label: variant.variantName }))}
                          allowNone={false}
                          disabled={!row.productId}
                          onChange={(variantId: string) => handleOrderVariantSelect(idx, variantId)}
                          searchPlaceholder="Search variant..."
                        />
                      </td>
                      <td className="py-2 px-3">
                        {(() => {
                          const unitOptions = getBuyerProductStockLevels(row.productId).map((level) => level.name);
                          const parsedTotal = parseBuyerOrderTotal(row.totalOrders, row.stockType || unitOptions[0] || 'Pieces');
                          const options = Array.from(new Set([...unitOptions, parsedTotal.unit]));
                          return parsedTotal.isMixed ? (
                            <div className="min-w-[150px] rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
                              {row.totalOrders}
                            </div>
                          ) : (
                            <div className="flex min-w-[370px] items-center gap-2">
                              <input
                                type="number"
                                value={parsedTotal.quantity}
                                onChange={(event) => handleOrderQuantityChange(idx, event.target.value)}
                                aria-label="Order quantity"
                                className="box-border h-[34px] shrink-0 rounded-lg border border-gray-200 px-3 py-2 text-xs text-black transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                style={{ width: '196px', minWidth: '196px', maxWidth: '196px', flex: '0 0 196px' }}
                              />
                              <ClientCatalogSelect
                                className="min-w-0 flex-1"
                                value={parsedTotal.unit}
                                placeholder="Select stock type"
                                options={options.map((unit) => ({ value: unit, label: unit }))}
                                allowNone={false}
                                onChange={(unit: string) => handleOrderUnitChange(idx, unit)}
                                searchPlaceholder="Search stock type..."
                              />
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex w-[220px] min-w-[220px] items-center">
                          <span className="mr-2 shrink-0 text-xs font-medium text-gray-500">{currencySymbol}</span>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            aria-label="Price per package"
                            value={getBuyerPricePerPackage(row) === null ? '' : String(getBuyerPricePerPackage(row) ?? '')}
                            onChange={(event) => handleOrderPricePerPackageChange(idx, event.target.value)}
                            placeholder="Enter price"
                            className="box-border !w-[196px] !min-w-[196px] !max-w-[196px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-black outline-none focus:border-[#0a61d7] focus:ring-1 focus:ring-[#0a61d7]"
                            style={{ width: '196px', minWidth: '196px', maxWidth: '196px', flex: '0 0 196px' }}
                            disabled={row.syncedFromOrders || isMarketplaceOrderNo(row.orderNo)}
                          />
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex w-[220px] min-w-[220px] items-center">
                          <span className="mr-2 shrink-0 text-xs font-medium text-gray-500">{currencySymbol}</span>
                          <input
                            type="text"
                            readOnly
                            aria-label="Automatically calculated total spend"
                            value={getBuyerCalculatedSpend(row)}
                            placeholder="0"
                            className="box-border !w-[196px] !min-w-[196px] !max-w-[196px] rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 outline-none"
                            style={{ width: '196px', minWidth: '196px', maxWidth: '196px', flex: '0 0 196px' }}
                          />
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex w-[220px] min-w-[220px] items-center">
                          <span className="mr-2 shrink-0 text-xs text-gray-500 font-medium">{currencySymbol}</span>
                          <ClientInput
                            fullWidth={false}
                            compact={false}
                            className="box-border !h-[34px] !w-[196px] !min-w-[196px] !max-w-[196px]"
                            value={row.outstanding || ''}
                            onChange={(outstanding) => handleOrderChange(idx, 'outstanding', outstanding)}
                            placeholder="0"
                          />
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <div className="box-border w-[196px] min-w-[196px] max-w-[196px]">
                          <ClientInput
                            fullWidth={false}
                            compact={false}
                            className="box-border !h-[34px] !w-[196px] !min-w-[196px] !max-w-[196px]"
                            type="date"
                            value={row.lastOrderDate || ''}
                            onChange={(lastOrderDate) => handleOrderChange(idx, 'lastOrderDate', lastOrderDate)}
                          />
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="rounded-full p-1 font-bold text-[#0a61d7] transition-colors hover:bg-blue-50"
                            onClick={addOrderRow}
                            aria-label={tBuyersModal('addRow')}
                            title={tBuyersModal('addRow')}
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                          <button 
                            type="button" 
                            className="rounded-full p-1 font-bold text-red-500 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50" 
                            onClick={() => deleteOrderRow(idx)} 

                            aria-label={tBuyersModal('deleteOrderRow', { index: idx + 1 })}
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
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-gray-500">
                {tShared('pagination.showing', {
                  from: orderRows.length === 0 ? 0 : orderPageStart + 1,
                  to: orderPageEnd,
                  total: orderRows.length,
                })}
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg p-2 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => setOrderPage((page) => Math.max(1, page - 1))}
                  disabled={safeOrderPage === 1}
                  aria-label={tShared('previousPage')}
                >
                  <ChevronLeft className="h-4 w-4 text-gray-500" />
                </button>
                {getVisiblePageNumbers(safeOrderPage, totalOrderPages).map((pageNumber) => (
                  <button
                    key={pageNumber}
                    type="button"
                    className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                      pageNumber === safeOrderPage ? 'bg-[#0a61d7] text-white' : 'bg-white text-[#0a61d7] hover:bg-[#f7faff]'
                    }`}
                    onClick={() => setOrderPage(pageNumber)}
                    aria-current={pageNumber === safeOrderPage ? 'page' : undefined}
                  >
                    {pageNumber}
                  </button>
                ))}
                <button
                  type="button"
                  className="rounded-lg p-2 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => setOrderPage((page) => Math.min(totalOrderPages, page + 1))}
                  disabled={safeOrderPage === totalOrderPages}
                  aria-label={tShared('nextPage')}
                >
                  <ChevronRight className="h-4 w-4 text-gray-500" />
                </button>
              </div>
            </div>
          </div>
          
          {/* Created At and Preferred Days */}
          <div className="flex gap-2">
            <ClientField
              className="flex-1"
              label={
                <span className="flex items-center gap-1">
                  {tBuyersModal('createdAt')}
                  <span className="text-xs text-gray-400 font-normal">{tBuyersModal('autoGenerated')}</span>
                  <span className="w-3 h-3 bg-gray-200 rounded-full flex items-center justify-center text-[8px] text-gray-500">i</span>
                </span>
              }
              type="date"
              value={form.createdAt || ''}
              onChange={(createdAt) => setForm((f) => ({ ...f, createdAt }))}
              disabled
              hint={tBuyersModal('createdAtHint')}
              id="buyer-created-at"
            />
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-700">
                {tBuyersModal('preferredDeliveryDays')}
              </label>
              <div className="relative" ref={preferredDaysDropdownRef}>
                <button
                  type="button"
                  onClick={() => {
                    setShowPreferredDaysDropdown((open) => !open);
                    setShowStatusDropdown(false);
                  }}
                  className={CLIENT_SELECT_BUTTON_CLASS}
                >
                  <span
                    className={`min-w-0 truncate ${
                      selectedPreferredDays.length ? 'text-black' : 'text-gray-500'
                    }`}
                  >
                    {selectedPreferredDays.length
                      ? selectedPreferredDays.map(translateWeekday).join(', ')
                      : tBuyersModal('selectPreferredDays')}
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
                </button>
                {showPreferredDaysDropdown && (
                  <div className="absolute bottom-full left-0 right-0 z-50 mb-1 overflow-visible rounded-lg border border-gray-300 bg-white py-1 shadow-lg">
                    {WEEKDAYS.map((day) => {
                      const selected = selectedPreferredDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => togglePreferredDay(day)}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-gray-100 ${
                            selected ? 'bg-gray-50 font-semibold text-[#0a61d7]' : 'text-gray-700'
                          }`}
                        >
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-all duration-200 ${
                              selected
                                ? 'border-green-500 bg-green-500'
                                : 'border-gray-300 bg-white hover:border-green-400'
                            }`}
                            aria-hidden
                          >
                            {selected ? (
                              <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path
                                  fillRule="evenodd"
                                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                  clipRule="evenodd"
                                />
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
          
          {/* Last order / last visit / success rate */}
          <div className="flex flex-col gap-2 @sm:flex-row">
            <ClientField
              className="flex-1"
              label={
                <span className="flex items-center gap-1">
                  {tBuyersModal('lastOrderDate')}
                  <span className="text-xs text-gray-400 font-normal">{tBuyersModal('autoFromOrders')}</span>
                  <span className="w-3 h-3 bg-gray-200 rounded-full flex items-center justify-center text-[8px] text-gray-500">i</span>
                </span>
              }
              type="date"
              value={computedLastShipment || ''}
              onChange={(lastShipment) => setForm((f) => ({ ...f, lastShipment }))}
              disabled
              hint={tBuyersModal('lastOrderDateHint')}
              id="buyer-last-shipment"
            />
            <ClientField
              className="flex-1"
              label={tBuyersModal('lastVisitDate')}
              type="date"
              value={form.lastVisit || ''}
              onChange={(lastVisit) => setForm((f) => ({ ...f, lastVisit }))}
              hint={tBuyersModal('lastVisitDateHint')}
              id="buyer-last-visit"
            />
            <ClientField
              className="flex-1"
              label={tBuyersModal('shipmentSuccessRate')}
              type="number"
              min={0}
              max={100}
              value={form.shipmentSuccess || ''}
              onChange={(shipmentSuccess) => setForm((f) => ({ ...f, shipmentSuccess }))}
              placeholder={tBuyersModal('shipmentSuccessPlaceholder')}
            />
          </div>
          
          {/* Notes */}
          <ClientField
            className="mb-4"
            label={
              <>
                {tBuyersModal('notesTags')}{' '}
                <span className="text-xs text-gray-400 font-normal">{tBuyersModal('commaSeparated')}</span>
              </>
            }
            value={form.notes || ''}
            onChange={(notes) => setForm((f) => ({ ...f, notes }))}
            placeholder={tBuyersModal('notesPlaceholder')}
          />
        </form>
      </div>

      {/* Rendered outside the form so the modal's buttons can never submit it. */}
      {showImportOrders && (
        <ImportOrdersModal
          open={showImportOrders}
          onCloseAction={() => setShowImportOrders(false)}
          onImportAction={handleImportOrders}
          productCatalog={orderProductCatalog}
        />
      )}

      {showSuccessModal && (
        <div className="fixed inset-0 flex items-center justify-center z-[60] pointer-events-none">
          <div className="bg-green-600 text-white rounded-lg shadow-2xl p-4 flex items-center gap-4 animate-fade-in pointer-events-auto">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <CheckCircle className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-md font-semibold">{tBuyersModal('saveSuccessTitle')}</h3>
              <p className="text-xs text-white/90">
                {isEditMode ? tBuyersModal('saveSuccessEdit') : tBuyersModal('saveSuccessCreate')}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

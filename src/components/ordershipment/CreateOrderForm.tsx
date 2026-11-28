'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronDown, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import MapComponent from '@/components/ordershipment/MapComponent';
import { useOrdersTranslations } from '@/hooks/useOrdersTranslations';
import { useUserStore } from '@/store/userStore';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { formatCurrency } from '@/utils/currencyUtils';
import { formatNumberByCurrency, parseNumberByCurrency } from '@/config/currencyConfig';
import { isBankTransferPaymentTerms, isCodPaymentTerms } from '@/utils/orderPayment';
import { geocodeAddress, type MapCoordinates } from '@/utils/mapboxUtils';
import { uploadToCloudinaryDirect } from '@/utils/cloudinaryDirect';
import { SkeletonOrderForm } from '@/components/skeleton/SkeletonOrderForm';
import {
  calculateOrderItemPromotion,
  normalizePromotionApplyMode,
  resolveMoqInPieces,
  type PromotionDetails,
} from '@/utils/promotionUtils';
import { roundMoney } from '@/utils/priceAnchorUtils';

const DELIVERY_METHODS = ['Self Pickup', 'Seller/Distributor Delivery', 'Buyer-arranged Courier'] as const;
const ORDER_STATUSES = ['Pending', 'Confirmed', 'Packed', 'Shipped', 'Delivered', 'Received', 'Failed', 'Cancelled', 'Returned'] as const;
const PAYMENT_STATUSES = ['Unpaid', 'Paid'] as const;
const PAYMENT_TERMS = [
  { value: 'Cash on Delivery', label: 'terms.cod' },
  { value: 'Bank Transfer', label: 'terms.bank' },
  { value: 'Net 7', label: 'terms.net7' },
  { value: 'Net 14', label: 'terms.net14' },
  { value: 'Net 30', label: 'terms.net30' },
] as const;
const POD_STATUSES = ['Delivered', 'Received', 'Returned'];
const JAKARTA: MapCoordinates = { longitude: 106.8456, latitude: -6.2088 };

const labelClass = 'block text-xs font-medium text-gray-700 mb-2';
const inputClass =
  'w-full px-3 py-2 text-black text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent bg-white';

type BuyerNode = {
  buyerId: string;
  owner: string;
  storeName: string;
  email: string;
  phone: string;
  address: string;
  status: string;
  logistics: string | null;
};
type VariantNode = {
  id: number;
  variantName: string;
  sellingPrice: number;
  sku: string | null;
  moq: number | null;
  /** Stock-level MOQ in packages of that level (e.g. Cartons: 3). */
  moqByStockLevel?: Record<string, number> | null;
  isDefault: boolean;
  isActive: boolean;
};
type StockLevelNode = {
  name: string;
  piecesPerUnit: number;
  unitsPerPreviousLevel?: number | null;
};
type ProductNode = {
  productId: string;
  name: string;
  sku: string;
  productType: string;
  images: string[];
  merchandisingCategorySlug: string | null;
  stockLevels?: StockLevelNode[] | null;
  variantOptions: VariantNode[];
};
type OfferNode = {
  id: string;
  productId: string | null;
  categoryId: string | null;
  variantOptionId: number | null;
  eligibleStockLevels: string[] | null;
  discountType: string;
  discountValue: number;
  buyQuantity: number | null;
  freeQuantity: number | null;
  /** from_zero | after_moq — defaults to after_moq when omitted. */
  promotionApplyMode?: string | null;
  startDate: string;
  endDate: string | null;
  status: string;
};
type Line = {
  key: number;
  productId: string;
  variantOptionId: string;
  quantity: string;
  /** Free pieces for this line (separate from paid qty / unit price). */
  freeItems: string;
  packageType: string;
  piecesPerPackage: number;
  /** Net package unit currently saved on the order (offer already applied). */
  savedUnit: number | null;
  /** Gross package list unit from originalPriceSnapshot × pieces, when offer was applied. */
  savedOriginalUnit: number | null;
  savedOfferApplied: boolean;
  savedDiscountAmount: number | null;
  savedDiscountPercentage: number | null;
  savedPromotion: string | null;
  savedOfferBadge: string | null;
  savedBuyerId: string;
  savedName: string;
  savedVariant: string;
};
type LoadedOrder = {
  buyerId?: string | null;
  orderDate?: string;
  orderStatus?: string;
  paymentStatus?: string;
  amountPaid?: number | null;
  deliveryMethod?: string;
  paymentTerms?: string;
  shippingFee?: number;
  discounts?: number | null;
  contactPerson?: string;
  storeName?: string;
  contactPhone?: string;
  customerEmail?: string | null;
  deliveryAddress?: string;
  preferredPickupDate?: string | null;
  preferredPickupTime?: string | null;
  estimatedArrivalDate?: string | null;
  estimatedArrivalMinDays?: number | null;
  estimatedArrivalMaxDays?: number | null;
  assignedLogistics?: string | null;
  trackingNumber?: string | null;
  deliveryNote?: string | null;
  pod?: string | null;
  orderItems?: Array<{
    productId?: string | null;
    variantOptionId?: number | null;
    packageQuantity?: number | null;
    pricePerPackage?: number | null;
    packageType?: string | null;
    piecesPerPackage?: number | null;
    productTypeSnapshot?: string | null;
    productName?: string;
    productNameSnapshot?: string | null;
    variantNameSnapshot?: string | null;
    offerApplied?: boolean | null;
    offerBadgeSnapshot?: string | null;
    originalPriceSnapshot?: number | null;
    discountAmount?: number | null;
    discountPercentage?: number | null;
    promotionDetailsSnapshot?: string | null;
  }>;
};

function productStockLevels(product: ProductNode | undefined): StockLevelNode[] {
  const levels: StockLevelNode[] = [{ name: 'Pieces', piecesPerUnit: 1 }];
  const seen = new Set<string>(['pieces']);
  for (const candidate of product?.stockLevels ?? []) {
    const name = String(candidate?.name ?? '').trim();
    const piecesPerUnit = Number(candidate?.piecesPerUnit);
    const key = name.toLocaleLowerCase();
    if (!name || seen.has(key) || !Number.isSafeInteger(piecesPerUnit) || piecesPerUnit < 2) continue;
    levels.push({ name, piecesPerUnit });
    seen.add(key);
  }
  return levels;
}

function todayInput(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function leadTimeDays(value: number | null | undefined): number | null {
  if (value == null) return null;
  const days = Number(value);
  if (!Number.isFinite(days) || days < 0 || days > 90) return null;
  return Math.floor(days);
}

function addInputDays(dateStr: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return '';
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateInput(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function logisticsLabel(raw: string | null | undefined): string {
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === 'string') return parsed;
    if (parsed && typeof parsed === 'object' && 'name' in parsed && typeof parsed.name === 'string') return parsed.name;
    return '';
  } catch {
    return raw.length <= 80 ? raw : '';
  }
}

const INTERNAL_FLEET = 'Internal fleet';
const THIRD_PARTY_PREFIX = '3PL: ';

function splitAssignedLogistics(value: string): { mode: '' | 'internal' | '3pl'; vendor: string } {
  const trimmed = value.trim();
  if (!trimmed) return { mode: '', vendor: '' };
  if (trimmed.toLowerCase() === 'internal fleet' || trimmed.toLowerCase() === 'armada internal') {
    return { mode: 'internal', vendor: '' };
  }
  if (trimmed.toLowerCase() === '3pl') return { mode: '3pl', vendor: '' };
  if (trimmed.toLowerCase().startsWith('3pl:')) return { mode: '3pl', vendor: trimmed.slice(4).trim() };
  return { mode: '3pl', vendor: trimmed };
}

function joinAssignedLogistics(mode: string, vendor: string): string {
  if (mode === 'internal') return INTERNAL_FLEET;
  if (mode !== '3pl') return '';
  const name = vendor.trim();
  return name ? `${THIRD_PARTY_PREFIX}${name}` : '3PL';
}

function offerIsCurrent(offer: OfferNode): boolean {
  if (offer.status !== 'active') return false;
  const start = new Date(offer.startDate);
  const end = offer.endDate ? new Date(offer.endDate) : null;
  const now = Date.now();
  if (Number.isNaN(start.getTime()) || start.getTime() > now) return false;
  if (end && !Number.isNaN(end.getTime()) && end.getTime() < now - 24 * 60 * 60 * 1000) return false;
  return true;
}

function pickOffer(offers: OfferNode[], product: ProductNode, variantId: number, stockLevelName: string): OfferNode | null {
  const current = offers.filter((offer) => offerIsCurrent(offer) &&
    (offer.eligibleStockLevels == null || offer.eligibleStockLevels.includes(stockLevelName)));
  return (
    current.find((offer) => offer.productId === product.productId && offer.variantOptionId === variantId) ||
    current.find((offer) => offer.productId === product.productId && offer.variantOptionId == null) ||
    current.find((offer) => !offer.productId && offer.categoryId && offer.categoryId === product.merchandisingCategorySlug) ||
    null
  );
}

function previewPrice(base: number, offer: OfferNode | null) {
  if (!offer) return { unit: base, kind: 'none' as const, percent: 0, amount: 0, buy: 0, free: 0 };
  let unit = base;
  let amount = 0;
  let percent = 0;
  if (offer.discountType === 'percentage') {
    percent = Math.min(100, Math.max(0, offer.discountValue));
    amount = (base * percent) / 100;
    unit = Math.max(0, base - amount);
  } else if (offer.discountType === 'fixed_amount') {
    amount = Math.min(base, Math.max(0, offer.discountValue));
    unit = Math.max(0, base - amount);
  }
  const free = offer.freeQuantity && offer.freeQuantity > 0 ? offer.freeQuantity : offer.discountType === 'buy_x_get_y' ? Math.round(offer.discountValue) : 0;
  const buy = offer.buyQuantity && offer.buyQuantity > 0 ? offer.buyQuantity : free > 0 ? 1 : 0;
  const promo = offer.discountType === 'buy_x_get_y' || (buy > 0 && free > 0);
  const discounted = amount > 0;
  const kind = promo && discounted ? 'both' : promo ? 'promo' : discounted && offer.discountType === 'percentage' ? 'percent' : discounted ? 'fixed' : 'none';
  return { unit: offer.discountType === 'buy_x_get_y' ? base : unit, kind, percent, amount, buy, free } as const;
}

function LakupakSelect({
  value,
  placeholder,
  options,
  allowEmpty = true,
  onChange,
}: {
  value: string;
  placeholder: string;
  options: { value: string; label: string }[];
  allowEmpty?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent text-black text-left flex items-center justify-between bg-white"
      >
        <span className={selected ? 'text-black truncate' : 'text-gray-500 truncate'}>{selected?.label || placeholder}</span>
        <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-[#e6e6e6] rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {allowEmpty && (
            <button
              type="button"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
              className={`w-full px-3 py-2 text-xs text-left hover:bg-gray-100 ${value === '' ? 'text-[#0a61d7] font-semibold bg-gray-50' : 'text-gray-500'}`}
            >
              {placeholder}
            </button>
          )}
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={`w-full px-3 py-2 text-xs text-left hover:bg-gray-100 ${
                value === option.value ? 'text-[#0a61d7] font-semibold bg-gray-50' : 'text-gray-700'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function blankLine(key: number): Line {
  return {
    key,
    productId: '',
    variantOptionId: '',
    quantity: '1',
    freeItems: '0',
    packageType: '',
    piecesPerPackage: 1,
    savedUnit: null,
    savedOriginalUnit: null,
    savedOfferApplied: false,
    savedDiscountAmount: null,
    savedDiscountPercentage: null,
    savedPromotion: null,
    savedOfferBadge: null,
    savedBuyerId: '',
    savedName: '',
    savedVariant: '',
  };
}

/** Piece MOQ for the selected stock level (level map first, then legacy pieces MOQ). */
function lineMoqInPieces(
  variant: Pick<VariantNode, 'moq' | 'moqByStockLevel'> | null | undefined,
  packageType: string,
  piecesPerPackage: number,
): number | null {
  return resolveMoqInPieces({
    packageType,
    piecesPerPackage,
    moqPieces: variant?.moq,
    moqByStockLevel: variant?.moqByStockLevel ?? null,
  });
}

/** Minimum paid package qty allowed for this variant + stock level (product MOQ). */
function minPackageQuantityForMoq(
  variant: Pick<VariantNode, 'moq' | 'moqByStockLevel'> | null | undefined,
  packageType: string,
  piecesPerPackage: number,
): number {
  const moqPieces = lineMoqInPieces(variant, packageType, piecesPerPackage);
  if (moqPieces == null || moqPieces <= 0) return 1;
  const ppp = Math.max(1, Math.trunc(piecesPerPackage) || 1);
  return Math.max(1, Math.ceil(moqPieces / ppp));
}

/**
 * Recompute free pieces from buy-x-get-y rules for a new qty.
 * Ignores absolute `freePieces` locks so applyMode (after_moq / from_zero) can run.
 */
function freePiecesFromPromotion(
  promotion: string | null | undefined,
  packageQuantity: number,
  piecesPerPackage: number,
  moq?: number | null,
): number {
  if (!promotion) return 0;
  let parsed: PromotionDetails | null = null;
  try {
    parsed = JSON.parse(promotion) as PromotionDetails;
  } catch {
    return 0;
  }
  if (!parsed) return 0;
  const { freePieces: _ignored, ...rules } = parsed;
  const moqPieces =
    moq != null && Number(moq) > 0
      ? Math.trunc(Number(moq))
      : rules.moq != null && Number(rules.moq) > 0
        ? Math.trunc(Number(rules.moq))
        : null;
  return (
    calculateOrderItemPromotion(
      { ...rules, moq: moqPieces },
      packageQuantity,
      piecesPerPackage,
      moqPieces,
    )?.freeQty || 0
  );
}

function suggestedFreePiecesFromOffer(
  offer: OfferNode | null,
  packageQuantity: number,
  piecesPerPackage: number,
  moqPieces: number | null,
): number {
  if (!offer || packageQuantity < 1) return 0;
  const free =
    offer.freeQuantity && offer.freeQuantity > 0
      ? offer.freeQuantity
      : offer.discountType === 'buy_x_get_y'
        ? Math.round(offer.discountValue)
        : 0;
  const buy = offer.buyQuantity && offer.buyQuantity > 0 ? offer.buyQuantity : free > 0 ? 1 : 0;
  if (!(buy > 0 && free > 0)) return 0;
  const applyMode = normalizePromotionApplyMode(offer.promotionApplyMode);
  return (
    calculateOrderItemPromotion(
      {
        minQuantity: buy,
        freeQuantity: free,
        applyMode,
        moq: moqPieces,
      },
      packageQuantity,
      piecesPerPackage,
      moqPieces,
    )?.freeQty || 0
  );
}

/** Live offer wins; otherwise recompute from saved promotion rules (+ MOQ / applyMode). */
function freePiecesForQuantityChange(opts: {
  liveOffer: OfferNode | null;
  savedPromotion: string | null | undefined;
  packageQuantity: number;
  piecesPerPackage: number;
  moqPieces: number | null;
}): number {
  const fromLive = suggestedFreePiecesFromOffer(
    opts.liveOffer,
    opts.packageQuantity,
    opts.piecesPerPackage,
    opts.moqPieces,
  );
  if (opts.liveOffer) return fromLive;
  return freePiecesFromPromotion(
    opts.savedPromotion,
    opts.packageQuantity,
    opts.piecesPerPackage,
    opts.moqPieces,
  );
}

function packageListUnit(line: Pick<Line, 'savedOriginalUnit' | 'savedUnit' | 'piecesPerPackage'>, catalogPiece: number): number {
  if (catalogPiece > 0) return catalogPiece * Math.max(1, line.piecesPerPackage || 1);
  if (line.savedOriginalUnit != null && Number.isFinite(line.savedOriginalUnit)) return line.savedOriginalUnit;
  if (line.savedUnit != null && Number.isFinite(line.savedUnit)) return line.savedUnit;
  return 0;
}

export default function CreateOrderForm({ orderId }: { orderId?: string }) {
  const editing = Boolean(orderId);
  const router = useRouter();
  const user = useUserStore((state) => state.user);
  const {
    tCreate,
    tDetails,
    tShared,
    translateDeliveryMethod,
    translateOrderStatus,
    translatePaymentStatus,
    translateFieldName,
  } = useOrdersTranslations();

  const [buyers, setBuyers] = useState<BuyerNode[]>([]);
  const [products, setProducts] = useState<ProductNode[]>([]);
  const [offers, setOffers] = useState<OfferNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderLoading, setOrderLoading] = useState(editing);
  const [loadError, setLoadError] = useState('');
  const [clientQuery, setClientQuery] = useState('');
  const [buyerId, setBuyerId] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [email, setEmail] = useState('');
  const [storeName, setStoreName] = useState('');
  const [orderDate, setOrderDate] = useState(todayInput);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [pin, setPin] = useState<MapCoordinates | null>(null);
  const [locating, setLocating] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState('Seller/Distributor Delivery');
  const [paymentTerms, setPaymentTerms] = useState('Cash on Delivery');
  const [orderStatus, setOrderStatus] = useState('Pending');
  const [paymentStatus, setPaymentStatus] = useState('Unpaid');
  const [savedStatus, setSavedStatus] = useState('Pending');
  const [savedPayment, setSavedPayment] = useState('Unpaid');
  const [paidInput, setPaidInput] = useState('0');
  const [unpaidDraft, setUnpaidDraft] = useState<string | null>(null);
  const loadedAmountPaid = useRef<number | null>(null);
  const fillPaidFromTotal = useRef(false);
  const [shippingFee, setShippingFee] = useState('0');
  const [pickupDate, setPickupDate] = useState('');
  const [pickupTime, setPickupTime] = useState('');
  const [estimatedDate, setEstimatedDate] = useState('');
  const [minDays, setMinDays] = useState('');
  const [maxDays, setMaxDays] = useState('');
  const [logisticsMode, setLogisticsMode] = useState('');
  const [logisticsVendor, setLogisticsVendor] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [deliveryNote, setDeliveryNote] = useState('');
  const [pod, setPod] = useState('');
  const [podFileName, setPodFileName] = useState('');
  const [podUploading, setPodUploading] = useState(false);
  const [lines, setLines] = useState<Line[]>([blankLine(1)]);
  const [nextKey, setNextKey] = useState(2);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const currency = user?.currency;

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(''), 10000);
    return () => window.clearTimeout(timer);
  }, [error]);
  const leadTimeTouched = useRef(false);
  const defaultLeadMin = leadTimeDays(user?.company?.defaultDeliveryLeadTimeMinDays);
  const defaultLeadMax = leadTimeDays(user?.company?.defaultDeliveryLeadTimeMaxDays);

  useEffect(() => {
    if (editing || leadTimeTouched.current) return;
    if (defaultLeadMin == null && defaultLeadMax == null) return;
    const min = defaultLeadMin != null && defaultLeadMax != null && defaultLeadMin > defaultLeadMax ? defaultLeadMax : defaultLeadMin;
    const max = defaultLeadMin != null && defaultLeadMax != null && defaultLeadMin > defaultLeadMax ? defaultLeadMin : defaultLeadMax;
    if (min != null) setMinDays(String(min));
    if (max != null) setMaxDays(String(max));
    const span = max ?? min;
    if (span != null) setEstimatedDate(addInputDays(orderDate, span));
  }, [editing, orderDate, defaultLeadMin, defaultLeadMax]);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError('');
      try {
        const [buyerData, productData] = await Promise.all([
          fetchGraphQL<{ buyers: { nodes: BuyerNode[] } }>(
            `query CreateOrderBuyers($userId: Int!) {
              buyers(userId: $userId, page: 1, limit: 200) {
                nodes { buyerId owner storeName email phone address status logistics }
              }
            }`,
            { userId: user.id },
          ),
          fetchGraphQL<{ products: { nodes: ProductNode[] } }>(
            `query CreateOrderProducts($userId: Int!) {
              products(userId: $userId, page: 1, limit: 200) {
                nodes {
                  productId name productType images merchandisingCategorySlug stockLevels
                  variantOptions { id variantName sellingPrice sku moq moqByStockLevel isDefault isActive }
                }
              }
            }`,
            { userId: user.id },
          ),
        ]);
        if (cancelled) return;
        setBuyers(buyerData.buyers?.nodes ?? []);
        setProducts(productData.products?.nodes ?? []);
      } catch {
        if (!cancelled) setLoadError(tCreate('loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, tCreate]);

  const placeAddress = useCallback(async (address: string) => {
    const trimmed = address.trim();
    if (!trimmed) return;
    setLocating(true);
    try {
      const found = await geocodeAddress(trimmed);
      if (found.coordinates) setPin(found.coordinates);
    } finally {
      setLocating(false);
    }
  }, []);

  useEffect(() => {
    if (!orderId || !user?.id) return;
    let cancelled = false;
    (async () => {
      setOrderLoading(true);
      try {
        const response = await fetch(`/api/orders?id=${encodeURIComponent(orderId)}&userId=${user.id}`, { cache: 'no-store' });
        if (!response.ok) throw new Error('missing');
        const order = (await response.json()) as LoadedOrder;
        if (cancelled) return;
        const nextBuyer = order.buyerId || '';
        setBuyerId(nextBuyer);
        setContactPerson(order.contactPerson || '');
        setContactPhone(order.contactPhone || '');
        setEmail(order.customerEmail || '');
        setStoreName(order.storeName || '');
        setOrderDate(dateInput(order.orderDate) || todayInput());
        setDeliveryAddress(order.deliveryAddress || '');
        setDeliveryMethod(order.deliveryMethod || 'Seller/Distributor Delivery');
        setPaymentTerms(order.paymentTerms || 'Cash on Delivery');
        setOrderStatus(order.orderStatus || 'Pending');
        setPaymentStatus(order.paymentStatus || 'Unpaid');
        setSavedStatus(order.orderStatus || 'Pending');
        setSavedPayment(order.paymentStatus || 'Unpaid');
        if (order.amountPaid != null && Number.isFinite(Number(order.amountPaid))) {
          loadedAmountPaid.current = Number(order.amountPaid);
          fillPaidFromTotal.current = false;
          setPaidInput(formatNumberByCurrency(Number(order.amountPaid), user.currency));
        } else if (order.paymentStatus === 'Paid') {
          loadedAmountPaid.current = null;
          fillPaidFromTotal.current = true;
        } else {
          loadedAmountPaid.current = null;
          fillPaidFromTotal.current = false;
          setPaidInput(formatNumberByCurrency(0, user.currency));
        }
        setUnpaidDraft(null);
        setShippingFee(String(order.shippingFee ?? 0));
        setPickupDate(dateInput(order.preferredPickupDate));
        setPickupTime(order.preferredPickupTime || '');
        setEstimatedDate(dateInput(order.estimatedArrivalDate));
        setMinDays(order.estimatedArrivalMinDays != null ? String(order.estimatedArrivalMinDays) : '');
        setMaxDays(order.estimatedArrivalMaxDays != null ? String(order.estimatedArrivalMaxDays) : '');
        const logistics = splitAssignedLogistics(order.assignedLogistics || '');
        setLogisticsMode(logistics.mode);
        setLogisticsVendor(logistics.vendor);
        setTrackingNumber(order.trackingNumber || '');
        setDeliveryNote(order.deliveryNote || '');
        setPod(order.pod || '');
        const loaded = (order.orderItems || []).filter((item) => item.productId && item.variantOptionId);
        const normalizedLoaded = loaded.map((item) => {
          const piecesPerPackage =
            item.packageType && item.packageType !== item.productTypeSnapshot
              ? Math.max(1, Number(item.piecesPerPackage) || 1)
              : 1;
          const originalPiece =
            item.originalPriceSnapshot != null && Number.isFinite(Number(item.originalPriceSnapshot))
              ? Number(item.originalPriceSnapshot)
              : null;
          return {
            ...item,
            packageType:
              item.packageType && item.packageType !== item.productTypeSnapshot
                ? item.packageType
                : 'Pieces',
            piecesPerPackage,
            savedOriginalUnit: originalPiece != null ? originalPiece * piecesPerPackage : null,
          };
        });
        if (normalizedLoaded.length > 0) {
          setLines(
            normalizedLoaded.map((item, index) => {
              let promoMoq: number | null = null;
              try {
                const promo = item.promotionDetailsSnapshot
                  ? (JSON.parse(item.promotionDetailsSnapshot) as PromotionDetails)
                  : null;
                if (promo?.moq != null && Number(promo.moq) > 0) {
                  promoMoq = Math.trunc(Number(promo.moq));
                }
              } catch {
                promoMoq = null;
              }
              const qty = Number(item.packageQuantity) || 1;
              return {
                key: index + 1,
                productId: item.productId || '',
                variantOptionId: String(item.variantOptionId),
                quantity: String(qty),
                packageType: item.packageType,
                piecesPerPackage: item.piecesPerPackage,
                savedUnit: item.pricePerPackage != null ? Number(item.pricePerPackage) : null,
                savedOriginalUnit: item.savedOriginalUnit,
                savedOfferApplied: item.offerApplied === true,
                freeItems: String(
                  freePiecesFromPromotion(
                    item.promotionDetailsSnapshot,
                    qty,
                    item.piecesPerPackage,
                    promoMoq,
                  ),
                ),
                savedDiscountAmount:
                  item.discountAmount != null && Number.isFinite(Number(item.discountAmount))
                    ? Number(item.discountAmount)
                    : null,
                savedDiscountPercentage:
                  item.discountPercentage != null && Number.isFinite(Number(item.discountPercentage))
                    ? Number(item.discountPercentage)
                    : null,
                savedPromotion: item.promotionDetailsSnapshot || null,
                savedOfferBadge: item.offerBadgeSnapshot || null,
                savedBuyerId: nextBuyer,
                savedName: item.productName || item.productNameSnapshot || item.productId || '',
                savedVariant: item.variantNameSnapshot || '',
              };
            }),
          );
          setNextKey(normalizedLoaded.length + 1);
        }
        if (order.deliveryAddress) void placeAddress(order.deliveryAddress);
      } catch {
        if (!cancelled) setError(tCreate('loadFailed'));
      } finally {
        if (!cancelled) setOrderLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, user?.id, placeAddress, tCreate]);

  useEffect(() => {
    if (!user?.id || !buyerId) {
      setOffers([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchGraphQL<{ offersForBuyer: OfferNode[] }>(
          `query CreateOrderOffers($userId: Int!, $buyerId: String!) {
            offersForBuyer(userId: $userId, buyerId: $buyerId) {
              id productId categoryId variantOptionId eligibleStockLevels
              discountType discountValue buyQuantity freeQuantity promotionApplyMode
              startDate endDate status
            }
          }`,
          { userId: user.id, buyerId },
        );
        if (!cancelled) setOffers(data.offersForBuyer ?? []);
      } catch {
        if (!cancelled) setOffers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, buyerId]);

  const catalog = useMemo(() => {
    const extras: ProductNode[] = [];
    for (const line of lines) {
      if (!line.productId || products.some((product) => product.productId === line.productId) || extras.some((product) => product.productId === line.productId)) continue;
      const variantId = Number(line.variantOptionId);
      const pieces = Math.max(1, line.piecesPerPackage || 1);
      // Fallback catalog must expose per-piece list price. Never reuse net package unit
      // as sellingPrice or live offers will discount an already-discounted value.
      const listPiece =
        line.savedOriginalUnit != null && Number.isFinite(line.savedOriginalUnit)
          ? line.savedOriginalUnit / pieces
          : line.savedUnit != null && Number.isFinite(line.savedUnit)
            ? line.savedUnit / pieces
            : 0;
      extras.push({
        productId: line.productId,
        name: line.savedName || line.productId,
        sku: '',
        productType: '',
        images: [],
        merchandisingCategorySlug: null,
        stockLevels: line.piecesPerPackage > 1
          ? [{ name: line.packageType, piecesPerUnit: line.piecesPerPackage }]
          : [{ name: 'Pieces', piecesPerUnit: 1 }],
        variantOptions: Number.isInteger(variantId)
          ? [{ id: variantId, variantName: line.savedVariant || line.variantOptionId, sellingPrice: listPiece, sku: null, moq: null, isDefault: true, isActive: true }]
          : [],
      });
    }
    // Real catalog first so find() never prefers a snapshot fallback.
    return [...products, ...extras];
  }, [lines, products]);

  const filteredBuyers = useMemo(() => {
    const query = clientQuery.trim().toLowerCase();
    if (!query) return buyers;
    return buyers.filter((buyer) => [buyer.storeName, buyer.owner, buyer.phone, buyer.buyerId].some((value) => value.toLowerCase().includes(query)));
  }, [buyers, clientQuery]);

  const onMapClick = useCallback((coordinates: MapCoordinates) => {
    setPin(coordinates);
    void (async () => {
      try {
        const response = await fetch('/api/mobile/geocode/reverse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ latitude: coordinates.latitude, longitude: coordinates.longitude }),
        });
        const data = (await response.json()) as { address?: string };
        if (typeof data.address === 'string' && data.address.trim()) setDeliveryAddress(data.address);
      } catch {
        // The pin still marks the point the distributor chose.
      }
    })();
  }, []);

  function selectBuyer(nextId: string) {
    setBuyerId(nextId);
    const buyer = buyers.find((row) => row.buyerId === nextId);
    if (!buyer) return;
    setContactPerson(buyer.owner || '');
    setContactPhone(buyer.phone || '');
    setEmail(buyer.email || '');
    setStoreName(buyer.storeName || '');
    setDeliveryAddress(buyer.address || '');
    const logistics = splitAssignedLogistics(logisticsLabel(buyer.logistics));
    setLogisticsMode(logistics.mode);
    setLogisticsVendor(logistics.vendor);
    if (buyer.address) void placeAddress(buyer.address);
  }

  function updateLine(key: number, patch: Partial<Line>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function chooseProduct(key: number, productId: string) {
    updateLine(key, {
      productId,
      // Require explicit variant and stock-level selection for each product line.
      variantOptionId: '',
      packageType: '',
      piecesPerPackage: 1,
      freeItems: '0',
      savedUnit: null,
      savedOriginalUnit: null,
      savedOfferApplied: false,
      savedDiscountAmount: null,
      savedDiscountPercentage: null,
      savedPromotion: null,
      savedOfferBadge: null,
    });
  }

  function chooseStockLevel(key: number, productId: string, levelName: string) {
    const product = catalog.find((row) => row.productId === productId);
    const level = productStockLevels(product).find((candidate) => candidate.name === levelName);
    if (!level) return;
    const line = lines.find((row) => row.key === key);
    const variantId = Number(line?.variantOptionId);
    const variant =
      product && Number.isInteger(variantId)
        ? product.variantOptions.find((option) => option.id === variantId)
        : undefined;
    const offer =
      product && Number.isInteger(variantId)
        ? pickOffer(offers, product, variantId, level.name)
        : null;
    const minQty = minPackageQuantityForMoq(variant, level.name, level.piecesPerUnit);
    const rawQty = Number.parseInt(line?.quantity || '0', 10) || 0;
    const qty = Math.max(minQty, rawQty > 0 ? rawQty : minQty);
    const moqPieces = lineMoqInPieces(variant, level.name, level.piecesPerUnit);
    updateLine(key, {
      packageType: level.name,
      piecesPerPackage: level.piecesPerUnit,
      quantity: String(qty),
      savedUnit: null,
      savedOriginalUnit: null,
      savedOfferApplied: false,
      savedDiscountAmount: null,
      savedDiscountPercentage: null,
      savedPromotion: null,
      savedOfferBadge: null,
      freeItems: String(suggestedFreePiecesFromOffer(offer, qty, level.piecesPerUnit, moqPieces)),
    });
  }

  const pricedLines = lines.map((line) => {
    const product = catalog.find((row) => row.productId === line.productId);
    const variant = product?.variantOptions.find((option) => String(option.id) === line.variantOptionId);
    const quantity = Number.parseInt(line.quantity, 10);
    const piecesPerPackage = Math.max(1, line.piecesPerPackage || 1);
    const catalogPiece = variant ? Number(variant.sellingPrice) : 0;
    const orderListPiece =
      line.savedOriginalUnit != null && Number.isFinite(line.savedOriginalUnit) && line.savedOriginalUnit > 0
        ? line.savedOriginalUnit / piecesPerPackage
        : 0;
    // Prefer the order's original list price so edit does not re-discount a moved catalog price.
    const basePiece = orderListPiece > 0 ? orderListPiece : catalogPiece > 0 ? catalogPiece : 0;
    const liveOffer = product && variant ? pickOffer(offers, product, variant.id, line.packageType) : null;
    const preview = previewPrice(basePiece, liveOffer);
    const qty = Number.isInteger(quantity) && quantity > 0 ? quantity : 0;
    const keepSaved = line.savedUnit != null && line.savedBuyerId === buyerId && line.savedBuyerId !== '';
    const listUnit = packageListUnit(line, basePiece);
    const unit = keepSaved
      ? line.savedUnit!
      : basePiece > 0
        ? preview.unit * piecesPerPackage
        : line.savedUnit ?? 0;
    const freeItems = Math.max(0, Number.parseInt(line.freeItems, 10) || 0);
    // Round package unit to currency minor units so IDR does not show
    // Rp181.200 × 9 as Rp1.630.799 from piece↔package float leftovers.
    const unitRounded = roundMoney(unit, currency);
    const listRounded = roundMoney(listUnit, currency);
    return {
      line,
      product,
      variant,
      qty,
      preview,
      liveOffer,
      unit: unitRounded,
      listUnit: listRounded,
      keepSaved,
      piecesPerPackage,
      freeItems,
      subtotal: roundMoney(unitRounded * qty, currency),
    };
  });

  const subtotal = roundMoney(
    pricedLines.reduce((sum, row) => sum + row.subtotal, 0),
    currency,
  );
  const shipping = roundMoney(parseNumberByCurrency(shippingFee || '0', currency) || 0, currency);
  // Order item package prices are already net of client offers. Do not subtract
  // order.discounts again or the edit total double-counts the same discount.
  const total = Math.max(0, roundMoney(subtotal + (Number.isFinite(shipping) ? shipping : 0), currency));
  const recordNett = isCodPaymentTerms(paymentTerms) || isBankTransferPaymentTerms(paymentTerms);
  const paidAmount = Math.min(total, Math.max(0, Math.round((parseNumberByCurrency(paidInput || '0', currency) || 0) * 100) / 100));
  const unpaidAmount = Math.max(0, Math.round((total - paidAmount) * 100) / 100);

  useEffect(() => {
    if (!fillPaidFromTotal.current) return;
    setPaidInput(formatNumberByCurrency(total, currency));
  }, [total, currency]);
  const completed = [
    { name: 'contactPerson', value: contactPerson.trim() },
    { name: 'contactPhone', value: contactPhone.trim() },
    { name: 'deliveryAddress', value: deliveryAddress.trim() },
    { name: 'deliveryMethod', value: deliveryMethod.trim() },
    { name: 'estimatedArrival', value: estimatedDate.trim() || (minDays.trim() && maxDays.trim()) ? 'set' : '' },
  ];
  const doneCount = completed.filter((field) => field.value !== '').length;
  const percent = Math.round((doneCount / completed.length) * 100);
  const missing = completed.filter((field) => field.value === '').map((field) => translateFieldName(field.name));

  /** Offer Applied column parts: discount (red) and/or promotion (purple). */
  function offerAppliedParts(
    preview: ReturnType<typeof previewPrice>,
    line: Line,
  ): { discount: string | null; promotion: string | null } {
    let discount: string | null = null;
    if (preview.percent > 0) {
      discount = tCreate('offerDiscPercent', { percent: String(Math.round(preview.percent)) });
    } else if (preview.amount > 0 && preview.kind !== 'promo') {
      discount = `${formatCurrency(preview.amount, currency)} ${tShared('offerBadges.off')}`;
    } else if (line.savedDiscountPercentage != null && line.savedDiscountPercentage > 0) {
      discount = tCreate('offerDiscPercent', { percent: String(Math.round(line.savedDiscountPercentage)) });
    } else if (line.savedDiscountAmount != null && line.savedDiscountAmount > 0) {
      discount = `${formatCurrency(line.savedDiscountAmount, currency)} ${tShared('offerBadges.off')}`;
    }

    let buy = preview.buy;
    let free = preview.free;
    if (!(buy > 0 && free > 0) && line.savedPromotion) {
      try {
        const parsed = JSON.parse(line.savedPromotion) as {
          minQuantity?: number;
          freeQuantity?: number;
          buyQuantity?: number;
        };
        buy = parsed.minQuantity ?? parsed.buyQuantity ?? 0;
        free = parsed.freeQuantity ?? 0;
      } catch {
        // ignore
      }
    }
    const promotion =
      buy > 0 && free > 0 ? tCreate('offerBuyGet', { min: String(buy), free: String(free) }) : null;

    return { discount, promotion };
  }

  const tableInputClass =
    'w-full min-w-[4.5rem] px-2 py-1.5 text-black text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent bg-white disabled:bg-gray-50 disabled:text-gray-700 disabled:cursor-not-allowed';
  const quantityHeader = (() => {
    const units = [...new Set(lines.map((row) => row.packageType).filter(Boolean))];
    return units.length === 1
      ? tCreate('quantityWithUnit', { unit: units[0] })
      : tCreate('quantity');
  })();

  function errorText(code: string | undefined): string {
    switch (code) {
      case 'unauthorized':
        return tCreate('errors.unauthorized');
      case 'client_not_found':
        return tCreate('errors.client_not_found');
      case 'product_not_found':
        return tCreate('errors.product_not_found');
      case 'variant_not_found':
        return tCreate('errors.variant_not_found');
      case 'duplicate_line':
        return tCreate('errors.duplicate_line');
      case 'invalid_duration':
        return tCreate('errors.invalid_duration');
      case 'insufficient_stock':
        return tCreate('errors.insufficient_stock');
      case 'invalid_stock_level':
        return tCreate('errors.invalid');
      default:
        return tCreate('errors.invalid');
    }
  }

  function messageFromOrderResponse(data: { code?: string; error?: string; detail?: string }): string {
    const detail = typeof data.detail === 'string' ? data.detail.trim() : '';
    if (detail) return detail;
    if (
      (data.code === 'invalid_stock_level' ||
        data.code === 'below_moq' ||
        data.code === 'insufficient_stock') &&
      typeof data.error === 'string' &&
      data.error.trim()
    ) {
      return data.error.trim();
    }
    return errorText(data.code);
  }

  async function uploadPod(file: File) {
    setPodFileName(file.name);
    setPodUploading(true);
    setError('');
    try {
      // Upload allowlist uses exact names (`pod`); `orders/pod` is rejected and remapped.
      const result = await uploadToCloudinaryDirect(file, 'pod');
      if (result.success && result.url) {
        setPod(result.url);
        return;
      }
      setPodFileName('');
      throw new Error(result.error || 'Upload failed');
    } catch (uploadError) {
      setPodFileName('');
      setError(
        tDetails('alerts.podUploadFailed', {
          error: uploadError instanceof Error ? uploadError.message : tCreate('saveFailed'),
        }),
      );
    } finally {
      setPodUploading(false);
    }
  }

  async function save() {
    setError('');
    if (podUploading) {
      setError(tDetails('editModal.podUploading'));
      return;
    }
    if (!buyerId) {
      setError(tCreate('needClient'));
      return;
    }
    if (!contactPerson.trim() || !contactPhone.trim() || !deliveryAddress.trim() || !deliveryMethod) {
      setError(tCreate('needFields'));
      return;
    }
    const belowMoq = pricedLines.some((row) => {
      if (!row.product || !row.variant || row.qty <= 0) return false;
      const minQty = minPackageQuantityForMoq(
        row.variant,
        row.line.packageType,
        row.piecesPerPackage,
      );
      return row.qty < minQty;
    });
    if (belowMoq) {
      setError(tCreate('fixBelowMoq'));
      return;
    }

    // Refresh free pieces with after_moq / from_zero before save (qty already MOQ-valid).
    const items = pricedLines
      .filter((row) => row.product && row.variant && row.qty > 0)
      .map((row) => {
        const moqPieces = lineMoqInPieces(
          row.variant,
          row.line.packageType,
          row.piecesPerPackage,
        );
        const freeItems = freePiecesForQuantityChange({
          liveOffer: row.liveOffer,
          savedPromotion: row.line.savedPromotion,
          packageQuantity: row.qty,
          piecesPerPackage: row.piecesPerPackage,
          moqPieces,
        });
        return {
          productId: row.product!.productId,
          variantOptionId: row.variant!.id,
          packageQuantity: row.qty,
          packageType: row.line.packageType,
          piecesPerPackage: row.piecesPerPackage,
          applyOffer: true,
          freeQuantityPieces: freeItems,
        };
      });
    if (items.length === 0) {
      setError(tCreate('needProduct'));
      return;
    }
    const min = minDays.trim() === '' ? null : Number(minDays);
    const max = maxDays.trim() === '' ? null : Number(maxDays);
    if ((min != null && (!Number.isInteger(min) || min < 0)) || (max != null && (!Number.isInteger(max) || max < 0)) || (min != null && max != null && min > max)) {
      setError(tCreate('errors.invalid_duration'));
      return;
    }

    const payload = {
      buyerId,
      items,
      contactPerson: contactPerson.trim(),
      contactPhone: contactPhone.trim(),
      customerEmail: email.trim(),
      storeName: storeName.trim(),
      deliveryAddress: deliveryAddress.trim(),
      deliveryMethod,
      paymentTerms,
      orderDate,
      shippingFee: Number.isFinite(shipping) ? shipping : 0,
      preferredPickupDate: deliveryMethod === 'Self Pickup' ? pickupDate || null : null,
      preferredPickupTime: deliveryMethod === 'Self Pickup' ? pickupTime.trim() : '',
      estimatedArrivalDate: deliveryMethod === 'Seller/Distributor Delivery' ? estimatedDate || null : null,
      estimatedArrivalMinDays: deliveryMethod === 'Seller/Distributor Delivery' ? min : null,
      estimatedArrivalMaxDays: deliveryMethod === 'Seller/Distributor Delivery' ? max : null,
      assignedLogistics: deliveryMethod === 'Seller/Distributor Delivery' ? joinAssignedLogistics(logisticsMode, logisticsVendor) : null,
      trackingNumber: deliveryMethod === 'Seller/Distributor Delivery' ? trackingNumber.trim() : '',
      deliveryNote: deliveryNote.trim(),
      // POD only applies to seller/distributor delivery (cleared for pickup/courier).
      pod: deliveryMethod === 'Seller/Distributor Delivery' ? pod || null : null,
    };

    setSaving(true);
    try {
      const response = await fetch('/api/orders', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing ? { ...payload, orderId, distributorEdit: true } : { ...payload, orderStatus, paymentStatus }),
      });
      const data = (await response.json()) as { orderId?: string; code?: string; error?: string; detail?: string };
      if (!response.ok || !data.orderId) {
        setError(messageFromOrderResponse(data));
        return;
      }
      if (editing && orderStatus !== savedStatus) {
        const statusResponse = await fetch('/api/orders', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, orderStatus }),
        });
        if (!statusResponse.ok) {
          const statusData = (await statusResponse.json().catch(() => ({}))) as {
            code?: string;
            error?: string;
            detail?: string;
          };
          setError(messageFromOrderResponse(statusData));
          return;
        }
      }
      const amountToSave = !recordNett
        ? null
        : unpaidDraft != null
          ? Math.max(0, Math.round((total - Math.min(total, Math.max(0, parseNumberByCurrency(unpaidDraft, currency) || 0))) * 100) / 100)
          : paidAmount;
      const statusToSave = amountToSave != null
        ? (total > 0 && amountToSave >= total - 0.001 ? 'Paid' : 'Unpaid')
        : paymentStatus;
      const loadedPaid = loadedAmountPaid.current;
      const amountChanged = amountToSave != null && (
        loadedPaid == null
          ? amountToSave > 0 || statusToSave === 'Paid'
          : Math.abs(loadedPaid - amountToSave) >= 0.001
      );
      if (editing && (statusToSave !== savedPayment || amountChanged)) {
        const paymentResponse = await fetch('/api/orders', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId,
            paymentStatus: statusToSave,
            ...(amountToSave != null ? { amountPaid: amountToSave } : {}),
          }),
        });
        if (!paymentResponse.ok) {
          const paymentData = (await paymentResponse.json().catch(() => ({}))) as {
            code?: string;
            error?: string;
            detail?: string;
          };
          setError(messageFromOrderResponse(paymentData));
          return;
        }
      }
      router.push(`/orders/details/${data.orderId}`);
    } catch {
      setError(tCreate('saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  const statusOptions = ORDER_STATUSES.map((status) => ({
    value: status,
    label: translateOrderStatus(status),
  }));
  const termOptions: { value: string; label: string }[] = PAYMENT_TERMS.map((term) => ({ value: term.value, label: tCreate(term.label) }));
  if (!termOptions.some((term) => term.value === paymentTerms) && paymentTerms) {
    termOptions.unshift({ value: paymentTerms, label: paymentTerms });
  }
  const methodOptions: { value: string; label: string }[] = DELIVERY_METHODS.map((method) => ({ value: method, label: translateDeliveryMethod(method) }));
  if (!methodOptions.some((method) => method.value === deliveryMethod) && deliveryMethod) {
    methodOptions.unshift({ value: deliveryMethod, label: deliveryMethod });
  }

  if (!user?.id && !loading) {
    return <p className="p-6 text-sm text-gray-600">{tCreate('signIn')}</p>;
  }

  if (editing && (orderLoading || loading) && !loadError && !error) {
    return <SkeletonOrderForm />;
  }

  return (
    <div className="flex min-h-full w-full min-w-0 flex-col bg-gradient-to-b from-gray-50 to-white p-4">
      <div className="mx-auto w-full">
        {(error || loadError) && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{error || loadError}</p>
        )}
        <div className="bg-white rounded-lg border border-[#e6e6e6]">
          <div className="flex min-w-0 flex-col gap-3 border-b border-[#e6e6e6] px-4 py-4 @5xl/main:flex-row @5xl/main:items-center @5xl/main:justify-between">
            <div className="flex min-w-0 flex-col gap-3 @3xl/main:flex-row @3xl/main:items-center">
              <Link
                href={editing && orderId ? `/orders/details/${orderId}` : '/orders'}
                className="flex w-full shrink-0 items-center justify-center gap-2 rounded-lg px-3 py-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800 @3xl/main:w-auto @3xl/main:justify-start"
              >
                <ArrowLeft className="h-4 w-4" />
                {tDetails('backButton')}
              </Link>
              <h1 className="min-w-0 truncate text-2xl font-bold text-gray-900">
                {editing ? tCreate('editTitle') : tCreate('title')}
              </h1>
            </div>
            <div className="flex w-full min-w-0 flex-col gap-2 @4xl/main:flex-row @4xl/main:flex-wrap @4xl/main:items-center @5xl/main:w-auto">
              <div className="w-full @4xl/main:w-40">
                <LakupakSelect value={orderStatus} placeholder={tCreate('orderStatus')} options={statusOptions} allowEmpty={false} onChange={setOrderStatus} />
              </div>
              <div className="w-full @4xl/main:w-32">
                <LakupakSelect
                  value={paymentStatus}
                  placeholder={tCreate('paymentStatus')}
                  options={PAYMENT_STATUSES.map((status) => ({ value: status, label: translatePaymentStatus(status) }))}
                  allowEmpty={false}
                  onChange={(value) => {
                    setPaymentStatus(value);
                    if (!(isCodPaymentTerms(paymentTerms) || isBankTransferPaymentTerms(paymentTerms))) return;
                    fillPaidFromTotal.current = false;
                    setUnpaidDraft(null);
                    if (value === 'Paid') setPaidInput(formatNumberByCurrency(total, currency));
                    if (value === 'Unpaid' && paidAmount >= total - 0.001) setPaidInput(formatNumberByCurrency(0, currency));
                  }}
                />
              </div>

            </div>
          </div>

          <section className="border-b border-[#e6e6e6] p-4">
            <div className="rounded-lg border border-blue-200 bg-gradient-to-r from-blue-50 to-amber-50 p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-800">{tDetails('completion.title')}</h2>
                <span className={`text-sm font-bold ${percent === 100 ? 'text-green-600' : 'text-amber-700'}`}>{percent}%</span>
              </div>
              <div className="mb-2 h-2 w-full rounded-full bg-gray-200">
                <div className={`h-2 rounded-full ${percent === 100 ? 'bg-green-500' : 'bg-amber-500'}`} style={{ width: `${percent}%` }} />
              </div>
              <p className="text-xs text-gray-600">
                {tDetails('completion.fieldsCompleted', { completed: doneCount, total: completed.length })}
                {missing.length > 0 && <span className="ml-2 text-amber-700">• {tDetails('completion.missing', { fields: missing.join(', ') })}</span>}
              </p>
            </div>
          </section>

          <section className="border-b border-[#e6e6e6] p-4">
            <h2 className="mb-4 text-sm font-semibold text-black">{tDetails('customerInfo.title')}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelClass}>{tCreate('client')}</label>
                <div className="relative mb-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    className="w-full pl-9 pr-3 py-2 text-black text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent bg-white"
                    value={clientQuery}
                    onChange={(event) => setClientQuery(event.target.value)}
                    placeholder={tCreate('clientPlaceholder')}
                  />
                </div>
                <LakupakSelect
                  value={buyerId}
                  placeholder={tCreate('clientPlaceholder')}
                  options={filteredBuyers.map((buyer) => ({ value: buyer.buyerId, label: `${buyer.storeName} | ${buyer.owner}` }))}
                  onChange={selectBuyer}
                />
                {!loading && buyers.length === 0 && (
                  <p className="mt-2 text-xs text-gray-600">
                    {tCreate('clientEmpty')} <Link href="/clients/buyers" className="font-medium text-[#0a61d7]">{tCreate('createClient')}</Link>
                  </p>
                )}
                {!editing && buyerId && <p className="mt-2 text-xs text-gray-500">{tCreate('activeNote')}</p>}
              </div>
              <div>
                <label className={labelClass}>{tCreate('contactPerson')}</label>
                <input className={inputClass} value={contactPerson} onChange={(event) => setContactPerson(event.target.value)} placeholder={tDetails('editModal.placeholders.contactPerson')} />
              </div>
              <div>
                <label className={labelClass}>{tCreate('storeName')}</label>
                <input className={inputClass} value={storeName} onChange={(event) => setStoreName(event.target.value)} />
              </div>
              <div>
                <label className={labelClass}>{tCreate('contactPhone')}</label>
                <input className={inputClass} value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} placeholder={tDetails('editModal.placeholders.contactPhone')} />
              </div>
              <div>
                <label className={labelClass}>{tCreate('email')}</label>
                <input className={inputClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
              </div>
              <div>
                <label className={labelClass}>{tCreate('orderDate')}</label>
                <input className={inputClass} type="date" value={orderDate} onChange={(event) => setOrderDate(event.target.value)} />
              </div>
            </div>
          </section>

          <section className="border-b border-[#e6e6e6] p-4">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-black">{tDetails('orderItems.title')}</h2>
            </div>
            <p className="mb-3 text-xs text-gray-500">{tCreate('offerNote')}</p>
            {!loading && products.length === 0 && (
              <p className="mb-3 text-xs text-gray-600">
                {tCreate('productsEmpty')} <Link href="/products/list" className="font-medium text-[#0a61d7]">{tCreate('createProduct')}</Link>
              </p>
            )}
            <div className="min-w-0 overflow-x-auto rounded-lg border border-[#e6e6e6]">
              <table className="min-w-full text-xs font-medium text-left">
                <thead className="bg-gray-100 text-gray-500">
                  <tr className="whitespace-nowrap">
                    <th className="px-3 py-2.5 font-medium uppercase">{tCreate('product')}</th>
                    <th className="px-3 py-2.5 font-medium uppercase">{tCreate('variant')}</th>
                    <th className="px-3 py-2.5 font-medium uppercase">{tCreate('stockType')}</th>
                    <th className="px-3 py-2.5 font-medium uppercase">{quantityHeader}</th>
                    <th className="px-3 py-2.5 font-medium uppercase">{tCreate('freeItems')}</th>
                    <th className="px-3 py-2.5 font-medium uppercase">{tCreate('unitPrice')}</th>
                    <th className="px-3 py-2.5 font-medium uppercase">{tCreate('offerApplied')}</th>
                    <th className="px-3 py-2.5 font-medium uppercase">{tCreate('lineTotal')}</th>
                    <th className="px-3 py-2.5 text-center font-medium uppercase">{tCreate('actions')}</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {pricedLines.map(({ line, product, variant, preview, liveOffer, unit, listUnit, piecesPerPackage }) => {
                    const variants = product?.variantOptions.filter((option) => option.isActive) ?? [];
                    const stockLevels = product ? productStockLevels(product) : [];
                    const selectedLevelExists = stockLevels.some((level) => level.name === line.packageType);
                    if (!selectedLevelExists && line.packageType && line.piecesPerPackage > 1) {
                      stockLevels.push({ name: line.packageType, piecesPerUnit: line.piecesPerPackage });
                    }
                    const quantityValue = Number.parseInt(line.quantity, 10) || 0;
                    const offerParts = offerAppliedParts(preview, line);
                    return (
                      <tr key={line.key} className="border-b border-[#e6e6e6] last:border-b-0 align-middle">
                        <td className="px-3 py-3 min-w-[10rem]">
                          <LakupakSelect
                            value={line.productId}
                            placeholder={tCreate('selectProduct')}
                            options={catalog.map((row) => ({ value: row.productId, label: row.name }))}
                            onChange={(value) => chooseProduct(line.key, value)}
                          />
                        </td>
                        <td className="px-3 py-3 min-w-[9rem]">
                          <LakupakSelect
                            value={line.variantOptionId}
                            placeholder={product ? 'None' : 'Select product first'}
                            options={variants.map((option) => ({ value: String(option.id), label: option.variantName }))}
                            onChange={(value) => {
                              const nextVariant = product?.variantOptions.find(
                                (option) => String(option.id) === value,
                              );
                              const nextOffer = product
                                ? pickOffer(offers, product, Number(value), line.packageType)
                                : null;
                              const minQty = minPackageQuantityForMoq(
                                nextVariant,
                                line.packageType,
                                piecesPerPackage,
                              );
                              const rawQty = Number.parseInt(line.quantity, 10) || 0;
                              const qty = Math.max(minQty, rawQty > 0 ? rawQty : minQty);
                              const moqPieces = lineMoqInPieces(
                                nextVariant,
                                line.packageType,
                                piecesPerPackage,
                              );
                              updateLine(line.key, {
                                variantOptionId: value,
                                quantity: String(qty),
                                savedUnit: null,
                                savedOriginalUnit: null,
                                savedOfferApplied: false,
                                savedDiscountAmount: null,
                                savedDiscountPercentage: null,
                                savedPromotion: null,
                                savedOfferBadge: null,
                                freeItems: String(
                                  suggestedFreePiecesFromOffer(
                                    nextOffer,
                                    qty,
                                    piecesPerPackage,
                                    moqPieces,
                                  ),
                                ),
                              });
                            }}
                          />
                        </td>
                        <td className="px-3 py-3 min-w-[7rem]">
                          <LakupakSelect
                            value={line.packageType}
                            placeholder={product ? 'None' : 'Select product first'}
                            allowEmpty={true}
                            options={stockLevels.map((level) => ({ value: level.name, label: level.name }))}
                            onChange={(value) => chooseStockLevel(line.key, line.productId, value)}
                          />
                        </td>
                        <td className="px-3 py-3 min-w-[6.5rem]">
                          {(() => {
                            const minQty = minPackageQuantityForMoq(
                              variant,
                              line.packageType,
                              piecesPerPackage,
                            );
                            const rawQty = Number.parseInt(line.quantity, 10) || 0;
                            const belowMoq =
                              Boolean(variant) &&
                              line.quantity.trim() !== '' &&
                              rawQty > 0 &&
                              rawQty < minQty;
                            return (
                              <div className="min-w-[6.5rem]">
                                <input
                                  className={`${tableInputClass}${
                                    belowMoq
                                      ? ' border-red-500 focus:border-red-500 focus:ring-red-500'
                                      : ''
                                  }`}
                                  inputMode="numeric"
                                  value={line.quantity}
                                  aria-invalid={belowMoq}
                                  title={
                                    line.packageType
                                      ? tCreate('quantityWithUnit', { unit: line.packageType })
                                      : tCreate('quantity')
                                  }
                                  aria-label={
                                    line.packageType
                                      ? tCreate('quantityWithUnit', { unit: line.packageType })
                                      : tCreate('quantity')
                                  }
                                  onChange={(event) => {
                                    const quantity = event.target.value.replace(/[^\d]/g, '');
                                    const nextQty = Number.parseInt(quantity, 10) || 0;
                                    const moqPieces = lineMoqInPieces(
                                      variant,
                                      line.packageType,
                                      piecesPerPackage,
                                    );
                                    const freeItems = freePiecesForQuantityChange({
                                      liveOffer,
                                      savedPromotion: line.savedPromotion,
                                      packageQuantity: nextQty,
                                      piecesPerPackage,
                                      moqPieces,
                                    });
                                    updateLine(line.key, {
                                      quantity,
                                      savedUnit: null,
                                      freeItems: String(freeItems),
                                    });
                                  }}
                                />
                                {belowMoq ? (
                                  <p className="mt-1 text-[10px] font-medium leading-tight text-red-600">
                                    {tCreate('belowMoq', {
                                      min: String(minQty),
                                      unit: line.packageType || tCreate('quantity'),
                                    })}
                                  </p>
                                ) : null}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-3 py-3 min-w-[5.5rem]">
                          <input
                            className={tableInputClass}
                            inputMode="numeric"
                            value={line.freeItems}
                            onChange={(event) =>
                              updateLine(line.key, {
                                freeItems: event.target.value.replace(/[^\d]/g, ''),
                              })
                            }
                            title="Free pieces (auto from offer MOQ rules; editable override)"
                          />
                        </td>
                        <td className="px-3 py-3 min-w-[8rem] whitespace-nowrap">
                          {listUnit > unit + 0.001 ? (
                            <span className="text-xs text-black">
                              <span className="text-gray-400 line-through mr-1.5">
                                {formatCurrency(listUnit, currency)}
                              </span>
                              <span className="font-medium">{formatCurrency(unit, currency)}</span>
                            </span>
                          ) : (
                            <span className="text-xs font-medium text-black">
                              {formatCurrency(unit, currency)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 min-w-[9rem] whitespace-nowrap">
                          {offerParts.discount || offerParts.promotion ? (
                            <span className="text-xs font-medium">
                              {offerParts.discount ? (
                                <span className="text-red-500">{offerParts.discount}</span>
                              ) : null}
                              {offerParts.discount && offerParts.promotion ? (
                                <span className="text-gray-400"> | </span>
                              ) : null}
                              {offerParts.promotion ? (
                                <span className="text-purple-600">{offerParts.promotion}</span>
                              ) : null}
                            </span>
                          ) : (
                            <span className="text-xs font-medium text-gray-400">{tCreate('offerNone')}</span>
                          )}
                        </td>
                        <td className="px-3 py-3 min-w-[7rem] whitespace-nowrap">
                          <span className="text-xs font-semibold text-black">
                            {formatCurrency(unit * quantityValue, currency)}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 items-center justify-center text-gray-400 transition-colors hover:text-[#0a61d7]"
                              aria-label={tCreate('addProduct')}
                              title={tCreate('addProduct')}
                              onClick={() => {
                                setLines((current) => [...current, blankLine(nextKey)]);
                                setNextKey((key) => key + 1);
                              }}
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              disabled={lines.length <= 1}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-400"
                              aria-label={tCreate('remove')}
                              title={tCreate('remove')}
                              onClick={() => setLines((current) => current.filter((row) => row.key !== line.key))}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="border-b border-[#e6e6e6] p-4">
            <h2 className="mb-4 text-sm font-semibold text-black">{tDetails('totalOrder.title')}</h2>
            <p className="mb-4 text-2xl font-bold text-[#0a61d7]">{formatCurrency(total, currency)}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {editing && orderId && (
                <div className="sm:col-span-2">
                  <div className={labelClass}>{tDetails('totalOrder.orderId')}</div>
                  <div className="text-xs font-medium text-black">{orderId}</div>
                </div>
              )}
              <div>
                <div className={labelClass}>{tDetails('totalOrder.totalOrderPrice')}</div>
                <div className="text-xs font-medium text-black">{formatCurrency(subtotal, currency)}</div>
              </div>
              <div>
                <label className={labelClass}>{tDetails('totalOrder.shippingCost')}</label>
                <input className={inputClass} inputMode="decimal" value={shippingFee} onChange={(event) => setShippingFee(event.target.value)} />
                <p className="mt-2 text-xs text-gray-500">{tCreate('shippingHint')}</p>
              </div>
              <div>
                <div className={labelClass}>{tDetails('totalOrder.currency')}</div>
                <div className="text-xs font-medium text-black">{currency || 'IDR'}</div>
              </div>
              <div>
                <label className={labelClass}>{tDetails('totalOrder.paymentTerms')}</label>
                <LakupakSelect value={paymentTerms} placeholder={tCreate('paymentTerms')} options={termOptions} allowEmpty={false} onChange={setPaymentTerms} />
              </div>
              {editing && recordNett && (
                <>
                  <div>
                    <label className="mb-2 block text-xs font-medium text-green-600" htmlFor="order-paid-amount">{tDetails('totalOrder.paymentAuth.paidAmount')}</label>
                    <input
                      id="order-paid-amount"
                      className={inputClass}
                      inputMode="decimal"
                      value={paidInput}
                      onChange={(event) => {
                        fillPaidFromTotal.current = false;
                        setUnpaidDraft(null);
                        setPaidInput(event.target.value);
                        const paid = Math.min(total, Math.max(0, parseNumberByCurrency(event.target.value || '0', currency) || 0));
                        setPaymentStatus(total > 0 && paid >= total - 0.001 ? 'Paid' : 'Unpaid');
                      }}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-medium text-red-600" htmlFor="order-unpaid-amount">{tDetails('totalOrder.paymentAuth.unpaidAmount')}</label>
                    <input
                      id="order-unpaid-amount"
                      className={inputClass}
                      inputMode="decimal"
                      value={unpaidDraft ?? formatNumberByCurrency(unpaidAmount, currency)}
                      onBlur={() => setUnpaidDraft(null)}
                      onChange={(event) => {
                        fillPaidFromTotal.current = false;
                        setUnpaidDraft(event.target.value);
                        const unpaid = Math.min(total, Math.max(0, parseNumberByCurrency(event.target.value || '0', currency) || 0));
                        const paid = Math.max(0, Math.round((total - unpaid) * 100) / 100);
                        setPaidInput(formatNumberByCurrency(paid, currency));
                        setPaymentStatus(total > 0 && paid >= total - 0.001 ? 'Paid' : 'Unpaid');
                      }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 sm:col-span-2">{tDetails('totalOrder.paymentAuth.nettHint')}</p>
                </>
              )}
              <div className="sm:col-span-2">
                <label className={labelClass}>{tDetails('totalOrder.deliveryMethod')}</label>
                <LakupakSelect value={deliveryMethod} placeholder={tCreate('deliveryMethod')} options={methodOptions} allowEmpty={false} onChange={setDeliveryMethod} />
              </div>
            </div>
            {deliveryMethod === 'Buyer-arranged Courier' ? (
              <p className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm font-medium text-blue-900">
                {tCreate('buyerArrangesLogistics')}
              </p>
            ) : deliveryMethod === 'Self Pickup' ? (
              <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
                <h3 className="mb-4 text-sm font-semibold text-blue-800">{tDetails('deliveryService.title')}</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>{tCreate('pickupDate')}</label>
                    <input className={inputClass} type="date" value={pickupDate} onChange={(event) => setPickupDate(event.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass}>{tCreate('pickupTime')}</label>
                    <input className={inputClass} value={pickupTime} onChange={(event) => setPickupTime(event.target.value)} placeholder={tDetails('editModal.placeholders.preferredDeliveryTime')} />
                  </div>
                </div>
              </div>
            ) : (
            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
              <h3 className="mb-4 text-sm font-semibold text-blue-800">{tDetails('deliveryService.title')}</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>{tCreate('assignedLogistics')}</label>
                  <LakupakSelect
                    value={logisticsMode}
                    placeholder={tCreate('assignedLogistics')}
                    options={[
                      { value: 'internal', label: tCreate('internalFleet') },
                      { value: '3pl', label: tCreate('thirdPartyLogistics') },
                    ]}
                    onChange={(value) => {
                      setLogisticsMode(value);
                      if (value !== '3pl') setLogisticsVendor('');
                    }}
                  />
                  {logisticsMode === '3pl' && (
                    <div className="mt-3">
                      <label className={labelClass} htmlFor="order-logistics-vendor">{tCreate('logisticsVendor')}</label>
                      <input
                        id="order-logistics-vendor"
                        className={inputClass}
                        maxLength={80}
                        value={logisticsVendor}
                        onChange={(event) => setLogisticsVendor(event.target.value)}
                        placeholder={tCreate('logisticsVendorPlaceholder')}
                      />
                    </div>
                  )}
                </div>
                <div>
                  <label className={labelClass}>{tCreate('trackingNumber')}</label>
                  <input className={inputClass} value={trackingNumber} onChange={(event) => setTrackingNumber(event.target.value)} placeholder={tDetails('editModal.placeholders.trackingNumber')} />
                </div>
                <div>
                  <label className={labelClass}>{tDetails('deliveryService.estimatedArrival')}</label>
                  <input className={inputClass} type="date" value={estimatedDate} onChange={(event) => { leadTimeTouched.current = true; setEstimatedDate(event.target.value); }} />
                </div>
                <div>
                  <label className={labelClass}>{tDetails('editModal.labels.estimatedArrivalDuration')}</label>
                  <div className="flex items-center gap-2">
                    <input className={inputClass} inputMode="numeric" placeholder={tDetails('editModal.placeholders.minDays')} value={minDays} onChange={(event) => { leadTimeTouched.current = true; setMinDays(event.target.value.replace(/[^\d]/g, '')); }} />
                    <span className="text-xs text-gray-500">{tDetails('editModal.durationTo')}</span>
                    <input className={inputClass} inputMode="numeric" placeholder={tDetails('editModal.placeholders.maxDays')} value={maxDays} onChange={(event) => { leadTimeTouched.current = true; setMaxDays(event.target.value.replace(/[^\d]/g, '')); }} />
                    <span className="text-xs text-gray-500">{tDetails('editModal.durationDays')}</span>
                  </div>
                </div>
              </div>
            </div>
            )}
          </section>

          <section className="p-4">
            <h2 className="mb-4 text-sm font-semibold text-black">{tDetails('updatesStatus.title')}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelClass}>{tDetails('updatesStatus.deliveryLocation')}</label>
                <div className="flex gap-2">
                  <input className={inputClass} value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} placeholder={tDetails('editModal.placeholders.deliveryAddress')} />
                  <button type="button" onClick={() => void placeAddress(deliveryAddress)} disabled={locating || !deliveryAddress.trim()} className="shrink-0 rounded-lg border border-[#e6e6e6] bg-white px-3 py-2 text-xs font-medium text-black hover:bg-gray-100 disabled:opacity-60">
                    {tCreate('findOnMap')}
                  </button>
                </div>
                <p className="mt-2 text-xs text-gray-500">{tCreate('mapHint')}</p>
                <div className="mt-3 overflow-hidden rounded-lg border border-[#e6e6e6]">
                  <MapComponent height="280px" zoom={pin ? 15 : 11} center={pin ?? JAKARTA} markers={pin ? [{ id: 'delivery', coordinates: pin, color: '#0a61d7' }] : []} onMapClick={onMapClick} />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>{tCreate('deliveryNote')}</label>
                <textarea className={inputClass} rows={3} value={deliveryNote} onChange={(event) => setDeliveryNote(event.target.value)} placeholder={tDetails('editModal.placeholders.deliveryNote')} />
              </div>
              {deliveryMethod === 'Seller/Distributor Delivery' &&
                POD_STATUSES.includes(orderStatus) && (
                <div className="sm:col-span-2">
                  <label className={labelClass}>{tDetails('editModal.labels.pod')}</label>
                  <div
                    className={`rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center ${
                      podUploading || pod || podFileName ? 'cursor-default' : 'cursor-pointer'
                    }`}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (podUploading || pod || podFileName) return;
                      const file = event.dataTransfer.files?.[0];
                      if (file) void uploadPod(file);
                    }}
                    onClick={() => {
                      if (pod || podFileName || podUploading) return;
                      document.getElementById('order-pod-input')?.click();
                    }}
                    role="button"
                    aria-busy={podUploading}
                    aria-label={tDetails('editModal.podUploadAria')}
                  >
                    <input
                      id="order-pod-input"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      disabled={podUploading}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadPod(file);
                        event.target.value = '';
                      }}
                    />
                    {podUploading ? (
                      <div className="flex flex-col items-center gap-2 text-xs text-gray-600">
                        <Loader2 className="h-5 w-5 animate-spin text-[#0a61d7]" aria-hidden />
                        <span className="font-medium text-[#0a61d7]">
                          {tDetails('editModal.podUploadingProgress')}
                        </span>
                        {podFileName ? (
                          <span className="text-[10px] text-gray-500">{podFileName}</span>
                        ) : null}
                      </div>
                    ) : (
                      <>
                        <div className="text-xs text-gray-600">
                          {podFileName ? (
                            <span className="font-medium">{tDetails('editModal.podSelected', { fileName: podFileName })}</span>
                          ) : pod ? (
                            <span className="font-medium">{tDetails('editModal.podExisting')}</span>
                          ) : (
                            <>
                              <span className="font-medium text-gray-700">{tDetails('editModal.podDragDrop')}</span> {tDetails('editModal.podDragDropSuffix')} <span className="font-semibold text-[#0a61d7]">{tDetails('editModal.podBrowse')}</span>
                            </>
                          )}
                        </div>
                        <p className="mt-1 text-[10px] text-gray-500">{tDetails('editModal.podAcceptedFormats')}</p>
                      </>
                    )}
                  </div>
                  {(pod || podFileName) && !podUploading ? (
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      {pod ? (
                        <a
                          href={pod}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-[#0a61d7] underline underline-offset-2 hover:text-[#084ba6]"
                        >
                          {tDetails('pod.view')}
                        </a>
                      ) : null}
                      <button
                        type="button"
                        className="text-xs font-semibold text-red-600 underline underline-offset-2 hover:text-red-700"
                        onClick={() => {
                          setPod('');
                          setPodFileName('');
                          setError('');
                        }}
                      >
                        {tDetails('editModal.podRemove')}
                      </button>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </section>
          <div className="sticky bottom-0 z-20 flex justify-end rounded-b-lg border-t border-[#e6e6e6] bg-white p-4">
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || loading || orderLoading || podUploading}
                className="w-full rounded-lg bg-[#0a61d7] px-4 py-2 text-sm font-semibold text-white hover:bg-[#084ba6] disabled:opacity-60 @4xl/main:w-auto"
              >
                {saving ? tCreate('saving') : editing ? tCreate('saveChanges') : tCreate('save')}
              </button>
          </div>
        </div>
      </div>
    </div>
  );
}

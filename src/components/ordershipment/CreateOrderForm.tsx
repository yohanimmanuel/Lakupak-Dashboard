'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronDown, Plus, Trash2 } from 'lucide-react';
import MapComponent from '@/components/ordershipment/MapComponent';
import { useOrdersTranslations } from '@/hooks/useOrdersTranslations';
import { useUserStore } from '@/store/userStore';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { formatCurrency } from '@/utils/currencyUtils';
import { parseNumberByCurrency } from '@/config/currencyConfig';
import { geocodeAddress, type MapCoordinates } from '@/utils/mapboxUtils';
import { uploadToCloudinaryDirect } from '@/utils/cloudinaryDirect';
import { SkeletonOrderForm } from '@/components/skeleton/SkeletonOrderForm';

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
  isDefault: boolean;
  isActive: boolean;
};
type ProductNode = {
  productId: string;
  name: string;
  sku: string;
  productType: string;
  images: string[];
  merchandisingCategorySlug: string | null;
  variantOptions: VariantNode[];
};
type OfferNode = {
  id: string;
  productId: string | null;
  categoryId: string | null;
  variantOptionId: number | null;
  discountType: string;
  discountValue: number;
  buyQuantity: number | null;
  freeQuantity: number | null;
  startDate: string;
  endDate: string | null;
  status: string;
};
type Line = {
  key: number;
  productId: string;
  variantOptionId: string;
  quantity: string;
  savedUnit: number | null;
  savedBuyerId: string;
  savedName: string;
  savedVariant: string;
};
type LoadedOrder = {
  buyerId?: string | null;
  orderDate?: string;
  orderStatus?: string;
  paymentStatus?: string;
  deliveryMethod?: string;
  paymentTerms?: string;
  shippingFee?: number;
  contactPerson?: string;
  storeName?: string;
  contactPhone?: string;
  customerEmail?: string | null;
  deliveryAddress?: string;
  preferredDeliveryDate?: string | null;
  preferredDeliveryTime?: string | null;
  estimatedDeliveryDate?: string | null;
  estimatedDeliveryMinDays?: number | null;
  estimatedDeliveryMaxDays?: number | null;
  assignedLogistics?: string | null;
  trackingNumber?: string | null;
  deliveryNote?: string | null;
  pod?: string | null;
  orderItems?: Array<{
    productId?: string | null;
    variantOptionId?: number | null;
    packageQuantity?: number | null;
    pricePerPackage?: number | null;
    productName?: string;
    productNameSnapshot?: string | null;
    variantNameSnapshot?: string | null;
  }>;
};

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

function pickOffer(offers: OfferNode[], product: ProductNode, variantId: number): OfferNode | null {
  const current = offers.filter(offerIsCurrent);
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
  return { key, productId: '', variantOptionId: '', quantity: '1', savedUnit: null, savedBuyerId: '', savedName: '', savedVariant: '' };
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
  const [shippingFee, setShippingFee] = useState('0');
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const [estimatedDate, setEstimatedDate] = useState('');
  const [minDays, setMinDays] = useState('');
  const [maxDays, setMaxDays] = useState('');
  const [logisticsMode, setLogisticsMode] = useState('');
  const [logisticsVendor, setLogisticsVendor] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [deliveryNote, setDeliveryNote] = useState('');
  const [pod, setPod] = useState('');
  const [podFileName, setPodFileName] = useState('');
  const [lines, setLines] = useState<Line[]>([blankLine(1)]);
  const [nextKey, setNextKey] = useState(2);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const currency = user?.currency;
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
                  productId name sku productType images merchandisingCategorySlug
                  variantOptions { id variantName sellingPrice sku moq isDefault isActive }
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
        setShippingFee(String(order.shippingFee ?? 0));
        setPreferredDate(dateInput(order.preferredDeliveryDate));
        setPreferredTime(order.preferredDeliveryTime || '');
        setEstimatedDate(dateInput(order.estimatedDeliveryDate));
        setMinDays(order.estimatedDeliveryMinDays != null ? String(order.estimatedDeliveryMinDays) : '');
        setMaxDays(order.estimatedDeliveryMaxDays != null ? String(order.estimatedDeliveryMaxDays) : '');
        const logistics = splitAssignedLogistics(order.assignedLogistics || '');
        setLogisticsMode(logistics.mode);
        setLogisticsVendor(logistics.vendor);
        setTrackingNumber(order.trackingNumber || '');
        setDeliveryNote(order.deliveryNote || '');
        setPod(order.pod || '');
        const loaded = (order.orderItems || []).filter((item) => item.productId && item.variantOptionId);
        if (loaded.length > 0) {
          setLines(
            loaded.map((item, index) => ({
              key: index + 1,
              productId: item.productId || '',
              variantOptionId: String(item.variantOptionId),
              quantity: String(item.packageQuantity || 1),
              savedUnit: item.pricePerPackage != null ? Number(item.pricePerPackage) : null,
              savedBuyerId: nextBuyer,
              savedName: item.productName || item.productNameSnapshot || item.productId || '',
              savedVariant: item.variantNameSnapshot || '',
            })),
          );
          setNextKey(loaded.length + 1);
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
              id productId categoryId variantOptionId
              discountType discountValue buyQuantity freeQuantity startDate endDate status
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
      extras.push({
        productId: line.productId,
        name: line.savedName || line.productId,
        sku: '',
        productType: '',
        images: [],
        merchandisingCategorySlug: null,
        variantOptions: Number.isInteger(variantId)
          ? [{ id: variantId, variantName: line.savedVariant || line.variantOptionId, sellingPrice: line.savedUnit || 0, sku: null, moq: null, isDefault: true, isActive: true }]
          : [],
      });
    }
    return [...extras, ...products];
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
    const product = catalog.find((row) => row.productId === productId);
    const active = product?.variantOptions.filter((option) => option.isActive) ?? [];
    const preferred = active.find((option) => option.isDefault) || active[0];
    updateLine(key, { productId, variantOptionId: preferred ? String(preferred.id) : '', savedUnit: null });
  }

  const pricedLines = lines.map((line) => {
    const product = catalog.find((row) => row.productId === line.productId);
    const variant = product?.variantOptions.find((option) => String(option.id) === line.variantOptionId);
    const quantity = Number.parseInt(line.quantity, 10);
    const offer = product && variant ? pickOffer(offers, product, variant.id) : null;
    const preview = previewPrice(variant ? Number(variant.sellingPrice) : 0, offer);
    const qty = Number.isInteger(quantity) && quantity > 0 ? quantity : 0;
    const keepSaved = line.savedUnit != null && line.savedBuyerId === buyerId && line.savedBuyerId !== '';
    const unit = keepSaved ? line.savedUnit! : preview.unit;
    return { line, product, variant, qty, preview, unit, keepSaved, subtotal: unit * qty };
  });

  const subtotal = pricedLines.reduce((sum, row) => sum + row.subtotal, 0);
  const shipping = parseNumberByCurrency(shippingFee || '0', currency) || 0;
  const total = subtotal + (Number.isFinite(shipping) ? shipping : 0);
  const completed = [
    { name: 'contactPerson', value: contactPerson.trim() },
    { name: 'contactPhone', value: contactPhone.trim() },
    { name: 'deliveryAddress', value: deliveryAddress.trim() },
    { name: 'deliveryMethod', value: deliveryMethod.trim() },
    { name: 'estimatedDelivery', value: estimatedDate.trim() || (minDays.trim() && maxDays.trim()) ? 'set' : '' },
  ];
  const doneCount = completed.filter((field) => field.value !== '').length;
  const percent = Math.round((doneCount / completed.length) * 100);
  const missing = completed.filter((field) => field.value === '').map((field) => translateFieldName(field.name));

  function offerLabel(preview: ReturnType<typeof previewPrice>): string {
    if (preview.kind === 'percent') return tShared('offerBadges.percentOff', { percent: String(Math.round(preview.percent)) });
    if (preview.kind === 'fixed') return `${formatCurrency(preview.amount, currency)} ${tShared('offerBadges.off')}`;
    if (preview.kind === 'promo') return tShared('offerBadges.buyGet', { min: String(preview.buy), free: String(preview.free) });
    if (preview.kind === 'both') {
      const price = preview.percent
        ? tShared('offerBadges.percentOff', { percent: String(Math.round(preview.percent)) })
        : `${formatCurrency(preview.amount, currency)} ${tShared('offerBadges.off')}`;
      return `${price}, ${tShared('offerBadges.buyGet', { min: String(preview.buy), free: String(preview.free) })}`;
    }
    return '';
  }

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
      default:
        return tCreate('errors.invalid');
    }
  }

  async function uploadPod(file: File) {
    setPodFileName(file.name);
    try {
      const result = await uploadToCloudinaryDirect(file, 'orders/pod');
      if (result.success && result.url) setPod(result.url);
      else throw new Error(result.error || 'Upload failed');
    } catch (uploadError) {
      setError(tDetails('alerts.podUploadFailed', { error: uploadError instanceof Error ? uploadError.message : tCreate('saveFailed') }));
    }
  }

  async function save() {
    setError('');
    if (!buyerId) {
      setError(tCreate('needClient'));
      return;
    }
    if (!contactPerson.trim() || !contactPhone.trim() || !deliveryAddress.trim() || !deliveryMethod) {
      setError(tCreate('needFields'));
      return;
    }
    const items = pricedLines
      .filter((row) => row.product && row.variant && row.qty > 0)
      .map((row) => ({ productId: row.product!.productId, variantOptionId: row.variant!.id, packageQuantity: row.qty }));
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
      preferredDeliveryDate: preferredDate || null,
      preferredDeliveryTime: preferredTime.trim(),
      estimatedDeliveryDate: estimatedDate || null,
      estimatedDeliveryMinDays: min,
      estimatedDeliveryMaxDays: max,
      assignedLogistics: joinAssignedLogistics(logisticsMode, logisticsVendor),
      trackingNumber: trackingNumber.trim(),
      deliveryNote: deliveryNote.trim(),
      pod: pod || null,
    };

    setSaving(true);
    try {
      const response = await fetch('/api/orders', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing ? { ...payload, orderId, distributorEdit: true } : { ...payload, orderStatus, paymentStatus }),
      });
      const data = (await response.json()) as { orderId?: string; code?: string };
      if (!response.ok || !data.orderId) {
        setError(errorText(data.code));
        return;
      }
      if (editing && orderStatus !== savedStatus) {
        const statusResponse = await fetch('/api/orders', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, orderStatus }),
        });
        if (!statusResponse.ok) {
          setError(tCreate('errors.invalid'));
          return;
        }
      }
      if (editing && paymentStatus !== savedPayment) {
        const paymentResponse = await fetch('/api/orders', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, paymentStatus }),
        });
        if (!paymentResponse.ok) {
          setError(tCreate('errors.invalid'));
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
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-4">
      <div className="mx-auto w-full">
        {(error || loadError) && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{error || loadError}</p>
        )}
        <div className="bg-white rounded-lg border border-[#e6e6e6]">
          <div className="flex items-center justify-between gap-4 border-b border-[#e6e6e6] px-4 py-4">
            <div className="flex min-w-0 items-center gap-4">
              <Link
                href={editing && orderId ? `/orders/details/${orderId}` : '/orders'}
                className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800"
              >
                <ArrowLeft className="h-4 w-4" />
                {tDetails('backButton')}
              </Link>
              <h1 className="truncate text-2xl font-bold text-gray-900">{editing ? tCreate('editTitle') : tCreate('title')}</h1>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="w-40">
                <LakupakSelect value={orderStatus} placeholder={tCreate('orderStatus')} options={statusOptions} allowEmpty={false} onChange={setOrderStatus} />
              </div>
              <div className="w-32">
                <LakupakSelect
                  value={paymentStatus}
                  placeholder={tCreate('paymentStatus')}
                  options={PAYMENT_STATUSES.map((status) => ({ value: status, label: translatePaymentStatus(status) }))}
                  allowEmpty={false}
                  onChange={setPaymentStatus}
                />
              </div>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || loading || orderLoading}
                className="rounded-lg bg-[#0a61d7] px-4 py-2 text-sm font-semibold text-white hover:bg-[#084ba6] disabled:opacity-60"
              >
                {saving ? tCreate('saving') : editing ? tCreate('saveChanges') : tCreate('save')}
              </button>
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
                <input className={inputClass + ' mb-2'} value={clientQuery} onChange={(event) => setClientQuery(event.target.value)} placeholder={tCreate('clientPlaceholder')} />
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
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-black">{tDetails('orderItems.title')}</h2>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg border border-[#e6e6e6] bg-white px-3 py-1.5 text-xs font-medium text-black hover:bg-gray-100"
                onClick={() => {
                  setLines((current) => [...current, blankLine(nextKey)]);
                  setNextKey((key) => key + 1);
                }}
              >
                <Plus className="h-4 w-4" />
                {tCreate('addProduct')}
              </button>
            </div>
            <p className="mb-3 text-xs text-gray-500">{tCreate('offerNote')}</p>
            {!loading && products.length === 0 && (
              <p className="mb-3 text-xs text-gray-600">
                {tCreate('productsEmpty')} <Link href="/products" className="font-medium text-[#0a61d7]">{tCreate('createProduct')}</Link>
              </p>
            )}
            <div className="divide-y divide-[#e6e6e6] rounded-lg border border-[#e6e6e6]">
              {pricedLines.map(({ line, product, preview, unit, keepSaved }) => {
                const variants = product?.variantOptions.filter((option) => option.isActive) ?? [];
                return (
                  <div key={line.key} className="grid gap-3 p-3 md:grid-cols-[1.3fr_1fr_88px_auto_auto]">
                    <div>
                      <label className={labelClass}>{tCreate('product')}</label>
                      <LakupakSelect
                        value={line.productId}
                        placeholder={tCreate('selectProduct')}
                        options={catalog.map((row) => ({ value: row.productId, label: row.name }))}
                        onChange={(value) => chooseProduct(line.key, value)}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>{tCreate('variant')}</label>
                      <LakupakSelect
                        value={line.variantOptionId}
                        placeholder={tCreate('selectVariant')}
                        options={variants.map((option) => ({ value: String(option.id), label: option.variantName }))}
                        onChange={(value) => updateLine(line.key, { variantOptionId: value, savedUnit: null })}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>{tCreate('quantity')}</label>
                      <input className={inputClass} inputMode="numeric" value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: event.target.value.replace(/[^\d]/g, ''), savedUnit: null })} />
                    </div>
                    <div>
                      <div className={labelClass}>{tCreate('unitPrice')}</div>
                      <div className="text-xs font-medium text-black">{formatCurrency(unit, currency)}</div>
                      {!keepSaved && preview.kind !== 'none' && <div className="mt-1 text-xs text-[#0a61d7]">{offerLabel(preview)}</div>}
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className={labelClass}>{tCreate('lineTotal')}</div>
                        <div className="text-xs font-semibold text-black">{formatCurrency(unit * (Number.parseInt(line.quantity, 10) || 0), currency)}</div>
                      </div>
                      {lines.length > 1 && (
                        <button type="button" className="text-gray-400 hover:text-red-600" aria-label={tCreate('remove')} onClick={() => setLines((current) => current.filter((row) => row.key !== line.key))}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
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
              <div className="sm:col-span-2">
                <label className={labelClass}>{tDetails('totalOrder.deliveryMethod')}</label>
                <LakupakSelect value={deliveryMethod} placeholder={tCreate('deliveryMethod')} options={methodOptions} allowEmpty={false} onChange={setDeliveryMethod} />
              </div>
            </div>
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
                  <label className={labelClass}>{tDetails('deliveryService.estimatedDelivery')}</label>
                  <input className={inputClass} type="date" value={estimatedDate} onChange={(event) => { leadTimeTouched.current = true; setEstimatedDate(event.target.value); }} />
                </div>
                <div>
                  <label className={labelClass}>{tDetails('editModal.labels.estimatedDeliveryDuration')}</label>
                  <div className="flex items-center gap-2">
                    <input className={inputClass} inputMode="numeric" placeholder={tDetails('editModal.placeholders.minDays')} value={minDays} onChange={(event) => { leadTimeTouched.current = true; setMinDays(event.target.value.replace(/[^\d]/g, '')); }} />
                    <span className="text-xs text-gray-500">{tDetails('editModal.durationTo')}</span>
                    <input className={inputClass} inputMode="numeric" placeholder={tDetails('editModal.placeholders.maxDays')} value={maxDays} onChange={(event) => { leadTimeTouched.current = true; setMaxDays(event.target.value.replace(/[^\d]/g, '')); }} />
                    <span className="text-xs text-gray-500">{tDetails('editModal.durationDays')}</span>
                  </div>
                </div>
                <div>
                  <label className={labelClass}>{tCreate('preferredDate')}</label>
                  <input className={inputClass} type="date" value={preferredDate} onChange={(event) => setPreferredDate(event.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>{tDetails('deliveryService.preferredTime')}</label>
                  <input className={inputClass} value={preferredTime} onChange={(event) => setPreferredTime(event.target.value)} placeholder={tDetails('editModal.placeholders.preferredDeliveryTime')} />
                </div>
              </div>
            </div>
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
              {POD_STATUSES.includes(orderStatus) && (
                <div className="sm:col-span-2">
                  <label className={labelClass}>{tDetails('editModal.labels.pod')}</label>
                  <div
                    className="cursor-pointer rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center"
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const file = event.dataTransfer.files?.[0];
                      if (file) void uploadPod(file);
                    }}
                    onClick={() => document.getElementById('order-pod-input')?.click()}
                    role="button"
                    aria-label={tDetails('editModal.podUploadAria')}
                  >
                    <input id="order-pod-input" type="file" accept="image/*,application/pdf" className="hidden" onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadPod(file);
                    }} />
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
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

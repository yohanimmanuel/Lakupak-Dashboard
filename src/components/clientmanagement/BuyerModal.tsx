'use client';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Trash, User, Upload, AlertCircle, CheckCircle, ChevronDown, ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import MapComponent from '@/components/ordershipment/MapComponent';
import { getDefaultCurrency, getCurrencySymbol } from '@/utils/currencyUtils';
import { uploadToCloudinaryDirect } from '@/utils/cloudinaryDirect';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useClientsTranslations } from '@/hooks/useClientsTranslations';
import { geocodeAddress, type MapCoordinates } from '@/utils/mapboxUtils';

const JAKARTA: MapCoordinates = { longitude: 106.8456, latitude: -6.2088 };

const statusOptions = ["Active", "Prospect", "Inactive", "Blocked"];

const BUYER_BUSINESS_TYPES = [
  'Warung',
  'Kiosk',
  'Minimarket',
  'Wholesaler',
  'Restaurant',
  'Hotel',
  'Canteen',
  'Other',
] as const;

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

interface BuyerModalProps {
  initialData?: Buyer;
  mode?: 'edit' | 'add';
  onSave?: (data: BuyerFormData) => void;
}

export default function BuyerModal({ initialData, mode = 'add', onSave }: BuyerModalProps) {
  const router = useRouter();
  const user = useUserStore(state => state.user);
  const { tBuyersModal, tShared, translateStatus } = useClientsTranslations();
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
          totalOrders: row.totalOrders || '',
          totalSpend: row.totalSpend || '',
          shippingFee: row.shippingFee || '',
          lastOrderDate: row.lastOrderDate || '',
          outstanding: row.outstanding || '',
        })) : [{ orderNo: '', product: '', totalOrders: '', totalSpend: '', shippingFee: '', lastOrderDate: '', outstanding: '' }];
      } catch {
        return [{ orderNo: '', product: '', totalOrders: '', totalSpend: '', shippingFee: '', lastOrderDate: '', outstanding: '' }];
      }
    })() : [{ orderNo: '', product: '', totalOrders: '', totalSpend: '', shippingFee: '', lastOrderDate: '', outstanding: '' }]
  );

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
  const [showBusinessTypeDropdown, setShowBusinessTypeDropdown] = useState(false);
  const [showPreferredDaysDropdown, setShowPreferredDaysDropdown] = useState(false);
  const [addressPin, setAddressPin] = useState<MapCoordinates | null>(null);
  const [locatingAddress, setLocatingAddress] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const businessTypeDropdownRef = useRef<HTMLDivElement>(null);
  const preferredDaysDropdownRef = useRef<HTMLDivElement>(null);

  const selectedPreferredDays = useMemo(
    () => parsePreferredDays(form.preferredDays || ''),
    [form.preferredDays],
  );

  const businessTypeOptions = useMemo(() => {
    const current = (form.businessType || '').trim();
    if (current && !(BUYER_BUSINESS_TYPES as readonly string[]).includes(current)) {
      return [current, ...BUYER_BUSINESS_TYPES];
    }
    return [...BUYER_BUSINESS_TYPES];
  }, [form.businessType]);

  const translateBusinessType = useCallback(
    (type: string) => {
      const key = `businessTypes.${type}`;
      if (typeof tBuyersModal.has === 'function') {
        return tBuyersModal.has(key) ? tBuyersModal(key) : type;
      }
      // Fallback when .has is unavailable: only translate known catalog types.
      return (BUYER_BUSINESS_TYPES as readonly string[]).includes(type)
        ? tBuyersModal(key)
        : type;
    },
    [tBuyersModal],
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
      if (businessTypeDropdownRef.current && !businessTypeDropdownRef.current.contains(target)) {
        setShowBusinessTypeDropdown(false);
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
  }, [form.storeName, form.owner, form.phone, form.email, form.address, tBuyersModal]);

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
    setOrderRows((rows: OrderDetail[]) => rows.map((row: OrderDetail, i: number) => i === idx ? { ...row, [field]: value } : row));
  }, []);

  const addOrderRow = useCallback(() => {
    setOrderRows((rows: OrderDetail[]) => [...rows, { orderNo: '', product: '', totalOrders: '', totalSpend: '', shippingFee: '', lastOrderDate: '', outstanding: '' }]);
  }, []);

  const deleteOrderRow = useCallback((idx: number) => {
    if (orderRows.length > 1) {
      setOrderRows((rows: OrderDetail[]) => rows.filter((_: OrderDetail, i: number) => i !== idx));
    }
  }, [orderRows.length]);

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
        orderDetails: JSON.stringify(orderRows),
        notes: JSON.stringify((form.notes || '').split(',').map((n: string) => n.trim()).filter(Boolean)),
        createdAt: isEditMode ? (form.createdAt ? new Date(form.createdAt).toISOString() : new Date().toISOString()) : new Date().toISOString(),
        logistics: JSON.stringify({
          preferredDays: form.preferredDays || '',
          lastShipment: computedLastShipment || '',
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
  }, [form, avatar, id, orderRows, isEditMode, initialData, user?.id, onSave, router, validateForm, handleError, isSubmitting, showSuccessModal, tBuyersModal]);

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
      shipmentSuccess: parsedLogistics.shipmentSuccess && !parsedLogistics.shipmentSuccess.includes('Missing') ? parsedLogistics.shipmentSuccess : '',
      notes: Array.isArray(parsedNotes) ? parsedNotes.join(', ') : '',
    });
    setId(isEditMode ? (initialData.buyerId || generateSecureBuyerId()) : generateSecureBuyerId());
    setOrderRows(
      orderDetails.length > 0 ? orderDetails.map((row: OrderDetail) => ({
        orderNo: row.orderNo || '',
        product: row.product || '',
        totalOrders: row.totalOrders || '',
        totalSpend: row.totalSpend || '',
        shippingFee: row.shippingFee || '',
        lastOrderDate: row.lastOrderDate || '',
        outstanding: row.outstanding || '',
      })) : [{ orderNo: '', product: '', totalOrders: '', totalSpend: '', shippingFee: '', lastOrderDate: '', outstanding: '' }]
    );
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
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">{tBuyersModal('businessType')}</label>
              <div className="relative" ref={businessTypeDropdownRef}>
                <button
                  type="button"
                  onClick={() => {
                    setShowBusinessTypeDropdown((open) => !open);
                    setShowStatusDropdown(false);
                  }}
                  className={CLIENT_SELECT_BUTTON_CLASS}
                >
                  <span className={form.businessType ? 'text-black' : 'text-gray-500'}>
                    {form.businessType
                      ? translateBusinessType(form.businessType)
                      : tBuyersModal('selectBusinessType')}
                  </span>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>
                {showBusinessTypeDropdown && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {businessTypeOptions.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          setForm((f) => ({ ...f, businessType: type }));
                          setShowBusinessTypeDropdown(false);
                        }}
                        className={`w-full px-3 py-2 text-xs text-left hover:bg-gray-100 ${
                          form.businessType === type
                            ? 'text-[#0a61d7] font-semibold bg-gray-50'
                            : 'text-gray-700'
                        }`}
                      >
                        {translateBusinessType(type)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">{tBuyersModal('status')}</label>
              <div className="relative" ref={statusDropdownRef}>
                <button
                  type="button"
                  onClick={() => {
                    setShowStatusDropdown((open) => !open);
                    setShowBusinessTypeDropdown(false);
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
            <label className="block text-sm font-bold text-black mb-2">{tBuyersModal('orderSection')}</label>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full text-xs font-medium text-left bg-white">
                <thead>
                  <tr className="text-gray-500 bg-gray-100 whitespace-nowrap">
                    <th className="py-2 px-3 font-medium uppercase">{tBuyersModal('colNo')}</th>
                    <th className="py-2 px-3 font-medium uppercase">{tBuyersModal('colProduct')}</th>
                    <th className="py-2 px-3 font-medium uppercase">{tBuyersModal('colTotalOrders')}</th>
                    <th className="py-2 px-3 font-medium uppercase">{tBuyersModal('colTotalSpend')}</th>
                    <th className="py-2 px-3 font-medium uppercase">{tBuyersModal('colLastOrderDate')}</th>
                    <th className="py-2 px-3 font-medium uppercase">{tBuyersModal('colOutstanding')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {orderRows.map((row: OrderDetail, idx: number) => (
                    <tr key={idx} className="whitespace-nowrap">
                      <td className="py-2 px-3 font-medium text-black">{idx + 1}</td>
                      <td className="py-2 px-3">
                        <ClientInput
                          value={row.product || ''}
                          onChange={(product) => handleOrderChange(idx, 'product', product)}
                        />
                      </td>
                      <td className="py-2 px-3">
                        <ClientInput
                          type="number"
                          value={row.totalOrders || ''}
                          onChange={(totalOrders) => handleOrderChange(idx, 'totalOrders', totalOrders)}
                        />
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center">
                          <span className="mr-2 text-xs text-gray-500 font-medium">{currencySymbol}</span>
                          <ClientInput
                            fullWidth={false}
                            className="flex-1 min-w-0"
                            value={row.totalSpend || ''}
                            onChange={(totalSpend) => handleOrderChange(idx, 'totalSpend', totalSpend)}
                            placeholder="0"
                          />
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <ClientInput
                          type="date"
                          value={row.lastOrderDate || ''}
                          onChange={(lastOrderDate) => handleOrderChange(idx, 'lastOrderDate', lastOrderDate)}
                        />
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center">
                          <span className="mr-2 text-xs text-gray-500 font-medium">{currencySymbol}</span>
                          <ClientInput
                            fullWidth={false}
                            className="flex-1 min-w-0"
                            value={row.outstanding || ''}
                            onChange={(outstanding) => handleOrderChange(idx, 'outstanding', outstanding)}
                            placeholder="0"
                          />
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <button 
                          type="button" 
                          className="text-red-500 font-bold p-1 hover:bg-red-100 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed" 
                          onClick={() => deleteOrderRow(idx)} 
                          disabled={orderRows.length === 1}
                          aria-label={tBuyersModal('deleteOrderRow', { index: idx + 1 })}
                        >
                          <Trash className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button 
              type="button" 
              className="mt-2 px-3 py-1 rounded-lg bg-[#0a61d7] text-white text-xs font-semibold hover:bg-[#084ba6] transition-colors" 
              onClick={addOrderRow}
            >
              {tBuyersModal('addRow')}
            </button>
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
                    setShowBusinessTypeDropdown(false);
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
          
          {/* Last Shipment and Success Rate */}
          <div className="flex gap-2">
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

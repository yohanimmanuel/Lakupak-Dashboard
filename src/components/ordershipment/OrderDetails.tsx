'use client';
import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, MapPin, Star, Package, DollarSign, Truck, CheckCircle, Clock, User, X, ChevronDown, Pencil, Gift, Loader2, ArrowRight, Maximize2, FileText, Download } from 'lucide-react';
import {
  isPaymentProofPdfUrl,
  paymentProofDisplayName,
  paymentProofDownloadFilename,
  paymentProofDownloadHref,
} from '@/utils/paymentProof';
import { isBankTransferPaymentTerms } from '@/utils/orderPayment';
import { Order, OrderWithSnapshots } from '@/types/order';
import { useUserStore } from '@/store/userStore';
import { calculateOrderSubtotal, calculateOrderTotalAmount, calculateOrderTotalQuantity } from '@/utils/orderCalculations';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';
import { uploadToCloudinaryDirect } from '@/utils/cloudinaryDirect';
import { calculateOrderItemPromotion } from '@/utils/promotionUtils';
import MapComponent from './MapComponent';
import MapFullscreenModal from '@/components/MapFullscreenModal';
import { useMapboxToken } from '@/hooks/useMapboxToken';
import { geocodeAddress, geocodeViaProxy, GeocodeResult, getOrderStatusMarkerColor } from '@/utils/mapboxUtils';

const RETURN_REASON_LABELS: Record<string, string> = {
  wrong_item: 'Wrong item received',
  defective: 'Defective or damaged',
  not_as_described: 'Not as described',
  changed_mind: 'Changed my mind',
  late_delivery: 'Late delivery',
  other: 'Other',
};

function getReturnReasonLabel(code: string): string {
  return RETURN_REASON_LABELS[code] || code;
}

/** Statuses where POD is shown and can be edited — distributor delivery records after handoff */
const POD_TRACKING_STATUSES = ['Delivered', 'Received', 'Returned'] as const;

interface OrderDetailsProps {
  order: OrderWithSnapshots;
  onBack: () => void;
}

export default function OrderDetails({ order, onBack }: OrderDetailsProps) {
  const user = useUserStore(state => state.user);
  const { token: mapboxToken } = useMapboxToken();
  const [showAllItems, setShowAllItems] = useState(false);
  const [earningsPage, setEarningsPage] = useState(1);
  const [orderStatus, setOrderStatus] = useState<string>(order.orderStatus);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<Order['paymentStatus']>(order.paymentStatus);
  const [showPaymentDropdown, setShowPaymentDropdown] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPaymentProofModal, setShowPaymentProofModal] = useState(false);
  const [showDeliveryMethodDropdown, setShowDeliveryMethodDropdown] = useState(false);
  const deliveryMethodDropdownRef = useRef<HTMLDivElement>(null);
  const [geocodeResult, setGeocodeResult] = useState<GeocodeResult | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [showMapFullscreen, setShowMapFullscreen] = useState(false);
  const [isProcessingReturn, setIsProcessingReturn] = useState(false);
  type DeliveryMethod = Order['deliveryMethod'];
  const toDateInputValue = (d?: Date | string | null) => {
    if (!d) return '';
    const date = typeof d === 'string' ? new Date(d) : d;
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
  };
  const orderWithDuration = order as Order & { estimatedDeliveryMinDays?: number | null; estimatedDeliveryMaxDays?: number | null };
  const [formFields, setFormFields] = useState({
    deliveryAddress: order.deliveryAddress,
    contactPerson: order.contactPerson,
    contactPhone: order.contactPhone,
    preferredDeliveryTime: order.preferredDeliveryTime || '',
    estimatedDeliveryDate: toDateInputValue(orderWithDuration.estimatedDeliveryDate),
    estimatedDeliveryMinDays: orderWithDuration.estimatedDeliveryMinDays != null ? String(orderWithDuration.estimatedDeliveryMinDays) : '',
    estimatedDeliveryMaxDays: orderWithDuration.estimatedDeliveryMaxDays != null ? String(orderWithDuration.estimatedDeliveryMaxDays) : '',
    deliveryNote: order.deliveryNote || '',
    assignedLogistics: order.assignedLogistics || '',
    trackingNumber: order.trackingNumber || '',
    deliveryMethod: order.deliveryMethod as DeliveryMethod,
    pod: order.pod || ''
  });
  const [podFileName, setPodFileName] = useState<string>('');
  const [showPodPreview, setShowPodPreview] = useState(false);
  const [durationError, setDurationError] = useState<string | null>(null);

  const latestPendingReturnRequest =
    order.returnRequests && order.returnRequests.find((rr) => rr.status === 'Pending');

  // POD file upload handler
  const handlePodUpload = async (file: File) => {
    if (!file) return;
    
    setPodFileName(file.name);
    
    try {
      // Direct upload to Cloudinary (faster, no base64 conversion)
      const result = await uploadToCloudinaryDirect(file, 'orders/pod');

      if (result.success && result.url) {
        setFormFields({ ...formFields, pod: result.url });
      } else {
        throw new Error(result.error || 'Upload failed');
      }
    } catch (error) {
      alert(`Failed to upload POD: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };
  
  // Use buyerId snapshot when buyer is deleted (FK set null)
  const buyerIdDisplay = order.buyerId || order.buyerIdSnapshot || '';
  const buyerHref = order.buyerId
    ? `/clients/buyers/details/${buyerIdDisplay}`
    : `/clients/buyers/deleted?id=${buyerIdDisplay}`;

  // Snapshot fallbacks for buyer-related display fields
  const contactPersonDisplay = order.buyerId ? order.contactPerson : (order.contactPersonSnapshot || order.contactPerson);
  const storeNameDisplay = order.buyerId ? order.storeName : (order.storeNameSnapshot || order.storeName);
  const contactPhoneDisplay = order.buyerId ? order.contactPhone : (order.contactPhoneSnapshot || order.contactPhone);
  const customerEmailDisplay = order.buyerId ? order.customerEmail : (order.customerEmailSnapshot || order.customerEmail);
  const orderDateDisplay = order.buyerId ? order.orderDate : (order.orderDateSnapshot || order.orderDate);
  const deliveryAddressDisplay = order.buyerId ? order.deliveryAddress : (order.deliveryAddressSnapshot || order.deliveryAddress);

  // Buyer avatar from included buyer relation (API returns order with buyer: true)
  const buyerAvatar = (order as OrderWithSnapshots & { buyer?: { avatar?: string | null } }).buyer?.avatar ?? null;

  useEffect(() => {
    const geocodeDeliveryAddress = async () => {
      if (!deliveryAddressDisplay) return;

      setIsGeocoding(true);
      try {
        const result = mapboxToken
          ? await geocodeAddress(deliveryAddressDisplay, mapboxToken)
          : (await geocodeViaProxy([deliveryAddressDisplay])).get(deliveryAddressDisplay) ?? {
              coordinates: null,
              address: deliveryAddressDisplay,
            };
        setGeocodeResult(result);
      } finally {
        setIsGeocoding(false);
      }
    };

    geocodeDeliveryAddress();
  }, [deliveryAddressDisplay, mapboxToken]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (deliveryMethodDropdownRef.current && !deliveryMethodDropdownRef.current.contains(event.target as Node)) {
        setShowDeliveryMethodDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
   
  // Extract unique offer badges from order items
  const getOrderOfferBadges = () => {
    const badges: Array<{ type: string; details?: Record<string, unknown> }> = [];
    const seenTypes = new Set<string>();
    
    order.orderItems?.forEach(item => {
      if (item.offerApplied && item.offerBadgeSnapshot) {
        const badge = item.offerBadgeSnapshot;
        
        if (badge === 'All Offers') {
          // Show both discount and promotion if "All Offers"
          if (!seenTypes.has('Discount') && item.discountPercentage) {
            badges.push({ type: 'Discount', details: { percentage: item.discountPercentage } });
            seenTypes.add('Discount');
          }
          if (!seenTypes.has('Promotion') && item.promotionDetailsSnapshot) {
            try {
              const promoDetails = JSON.parse(item.promotionDetailsSnapshot);
              badges.push({ type: 'Promotion', details: promoDetails });
              seenTypes.add('Promotion');
            } catch (e) {
              // Invalid JSON, skip
            }
          }
        } else if (badge === 'Discount' && !seenTypes.has('Discount') && item.discountPercentage) {
          badges.push({ type: 'Discount', details: { percentage: item.discountPercentage } });
          seenTypes.add('Discount');
        } else if (badge === 'Promotion' && !seenTypes.has('Promotion') && item.promotionDetailsSnapshot) {
          try {
            const promoDetails = JSON.parse(item.promotionDetailsSnapshot);
            badges.push({ type: 'Promotion', details: promoDetails });
            seenTypes.add('Promotion');
          } catch (e) {
            // Invalid JSON, skip
          }
        }
      }
    });
    
    return badges;
  };
  
  // Calculate promotion free items for an order item - REMOVED DUPLICATE LOGIC
  // Now using calculateOrderItemPromotion from utils/promotionUtils.ts (SAME as Marketplace)

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Pending': return 'bg-yellow-100 text-yellow-800 font-semibold';
      case 'Confirmed': return 'bg-blue-100 text-blue-800 font-semibold';
      case 'Packed': return 'bg-purple-100 text-purple-800 font-semibold';
      case 'Shipped': return 'bg-indigo-100 text-indigo-800 font-semibold';
      case 'Delivered': return 'bg-green-100 text-green-800 font-semibold';
      case 'Received': return 'bg-emerald-100 text-emerald-800 font-semibold';
      case 'Failed': return 'bg-red-100 text-red-800 font-semibold';
      case 'Cancelled': return 'bg-red-100 text-red-800 font-semibold';
      case 'Returned': return 'bg-orange-100 text-orange-800 font-semibold';
      default: return 'bg-gray-100 text-gray-800 font-semibold';
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'Paid': return 'bg-green-100 text-green-800 font-semibold';
      case 'Unpaid': return 'bg-red-100 text-red-800 font-semibold';
      default: return 'bg-gray-100 text-gray-800 font-semibold';
    }
  };

  const PAYMENT_STATUS_OPTIONS: Array<Order['paymentStatus']> = ['Unpaid', 'Paid'];

  const paymentMethodLabel = (() => {
    const raw = (order.paymentTerms || '').trim();
    if (!raw) return 'Payment';
    if (raw.toLowerCase().includes('cash')) return 'COD';
    if (raw.toLowerCase().includes('cod')) return 'COD';
    if (raw.toLowerCase().includes('bank')) return 'BANK';
    if (raw.toLowerCase().includes('transfer')) return 'BANK';
    return raw;
  })();

  const paymentMethodSubtitle = (() => {
    const raw = (order.paymentTerms || '').trim();
    if (!raw) return 'Method';
    if (raw.toLowerCase().includes('cash')) return 'Cash on Delivery';
    if (raw.toLowerCase().includes('cod')) return 'Cash on Delivery';
    if (raw.toLowerCase().includes('bank')) return 'Transfer';
    if (raw.toLowerCase().includes('transfer')) return 'Transfer';
    return raw;
  })();

  const paymentProofUrls = (order.paymentProofUrls ?? []).filter(
    (u): u is string => typeof u === 'string' && u.trim().length > 0,
  );
  const showPaymentProof =
    isBankTransferPaymentTerms(order.paymentTerms) && paymentProofUrls.length > 0;

  const calculateSubtotal = () => calculateOrderSubtotal(order);
  const calculateTotalAmount = () => calculateOrderTotalAmount(order);
  const calculateTotalQuantity = () => calculateOrderTotalQuantity(order);



  // Calculate pagination for earnings table
  const earningsPerPage = 4;
  const totalEarningsPages = Math.ceil(order.orderItems.length / earningsPerPage);
  const startIndex = (earningsPage - 1) * earningsPerPage;
  const endIndex = startIndex + earningsPerPage;
  const currentEarningsItems = order.orderItems.slice(startIndex, endIndex);

  const formatDeliveryOption = (value: string) => {
    if (!value) return '';
    return value
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ');
  };

  const parseDateValue = (value?: string | Date | null) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const formatSchedule = (dateValue?: string | Date | null, timeValue?: string | null) => {
    const parsedDate = parseDateValue(dateValue);
    const trimmedTime = timeValue?.trim();

    if (parsedDate && trimmedTime) {
      const [hoursStr, minutesStr] = trimmedTime.split(':');
      const hours = Number(hoursStr);
      const minutes = Number(minutesStr);
      if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
        const adjustedDate = new Date(parsedDate);
        adjustedDate.setHours(hours, minutes, 0, 0);
        return adjustedDate.toLocaleString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
      }
    }

    if (parsedDate) {
      return parsedDate.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    }

    return trimmedTime || null;
  };

  const shippingMethodLabel =
    order.shippingMethodLabel ||
    order.shippingMethod ||
    (typeof order.deliveryOption === 'string' ? order.deliveryOption : '') ||
    order.deliveryMethod ||
    '';
  const normalizedShippingMethod = shippingMethodLabel.toLowerCase();
  const formattedShippingOption = shippingMethodLabel ? formatDeliveryOption(shippingMethodLabel) : '';
  const isPickupMethod = normalizedShippingMethod.includes('pickup') || normalizedShippingMethod.includes('self pickup');
  const isScheduledMethod = normalizedShippingMethod.includes('scheduled');
  const isSellerDelivery = normalizedShippingMethod.includes('seller') || normalizedShippingMethod.includes('distributor');
  const isBuyerCourier = normalizedShippingMethod.includes('courier') || normalizedShippingMethod.includes('buyer-arranged') || normalizedShippingMethod.includes('buyer arranged');

  const scheduleDateCandidate = isPickupMethod
    ? order.preferredPickupDate || order.preferredDeliveryDate || null
    : order.preferredDeliveryDate || order.preferredPickupDate || null;

  const scheduleTimeCandidate = isPickupMethod
    ? order.preferredPickupTime || order.preferredDeliveryTime || null
    : order.preferredDeliveryTime || order.preferredPickupTime || null;

  const formattedSchedule = formatSchedule(scheduleDateCandidate, scheduleTimeCandidate);
  // Show notice for any method whenever a scheduled date/time exists
  const shouldShowScheduleNotice = Boolean(formattedSchedule);
  const highlightShipping = isPickupMethod || isScheduledMethod || isSellerDelivery || isBuyerCourier;
  const shippingAccentClass = highlightShipping ? 'text-yellow-600 font-semibold' : 'text-black font-medium';

  const requiredOrderFields = [
    { name: 'Contact person', value: String(order.contactPerson || '').trim() },
    { name: 'Contact phone', value: String(order.contactPhone || '').trim() },
    { name: 'Delivery address', value: String(order.deliveryAddress || '').trim() },
    { name: 'Delivery method', value: String(order.deliveryMethod || '').trim() },
    { name: 'Estimated delivery', value: Boolean(orderWithDuration.estimatedDeliveryDate) || (typeof orderWithDuration.estimatedDeliveryMinDays === 'number' && typeof orderWithDuration.estimatedDeliveryMaxDays === 'number') },
  ];
  const completedOrderFields = requiredOrderFields.filter(f => typeof f.value === 'boolean' ? f.value : f.value !== '');
  const orderCompletionPercentage = Math.round((completedOrderFields.length / requiredOrderFields.length) * 100);
  const missingOrderFields = requiredOrderFields.filter(f => typeof f.value === 'boolean' ? !f.value : f.value === '');

  return (
    <div className="bg-white p-4 rounded-lg border border-[#e6e6e6]">
      <div className="w-full mx-auto">
        {/* Order completion progress */}
        <div className="mx-0 mt-0 mb-4 p-4 bg-gradient-to-r from-blue-50 to-amber-50 border border-blue-200 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-800">Order information completion</h3>
            <span className={`text-sm font-bold ${orderCompletionPercentage === 100 ? 'text-green-600' : 'text-amber-700'}`}>
              {orderCompletionPercentage}%
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${orderCompletionPercentage === 100 ? 'bg-green-500' : 'bg-amber-500'}`}
              style={{ width: `${orderCompletionPercentage}%` }}
            />
          </div>
          <div className="text-xs text-gray-600">
            {completedOrderFields.length} of {requiredOrderFields.length} fields completed
            {missingOrderFields.length > 0 && (
              <span className="ml-2 text-amber-700">
                • Missing: {missingOrderFields.map(f => f.name).join(', ')}
              </span>
            )}
          </div>
        </div>

        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />   
            <span className="text-xl font-semibold">Back to Order Lists</span>
          </button>
          
          {/* Status Buttons - Top Right */}
          <div className="flex flex-wrap gap-2">
            {/* Offer Badges - Show if products were ordered with active offers */}
            {getOrderOfferBadges().map((badge, index) => (
              <div
                key={index}
                className={`flex items-center gap-1 py-2 px-3 rounded-lg text-xs font-semibold ${
                  badge.type === 'Discount' 
                    ? 'bg-red-50 text-red-600 border border-red-200' 
                    : 'bg-purple-50 text-purple-600 border border-purple-200'
                }`}
              >
                {badge.type === 'Promotion' && <Gift className="w-3 h-3" />}
                {badge.type === 'Discount' && badge.details?.percentage 
                  ? `${badge.details.percentage}% OFF`
                  : badge.type === 'Promotion' && badge.details?.minQuantity && badge.details?.freeQuantity
                    ? `Buy ${badge.details.minQuantity} Get ${badge.details.freeQuantity}`
                    : badge.type}
              </div>
            ))}
            {/* Order Status Dropdown */}
            <div className="relative group">
              <button
                className={`flex items-center gap-1 py-2 px-4 rounded-lg text-sm font-medium min-w-[120px] ${getStatusColor(orderStatus)} hover:opacity-80 transition-all duration-200`}
                onClick={() => {
                  setShowPaymentDropdown(false);
                  setShowStatusDropdown((v) => !v);
                }}
                title="Update your order or shipment status here"
              >
                {orderStatus}
                <ChevronDown className="w-4 h-4 ml-3 text-gray-500" />
              </button>
              
              {/* Hover tooltip */}
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
                Update your order or shipment status here
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>
              </div>
              
              {/* Dropdown Menu */}
              {showStatusDropdown && (
                <div className="absolute right-0 mt-2 w-32 bg-white border border-[#e6e6e6] rounded-lg shadow-lg z-20">
                  {['Pending', 'Confirmed', 'Packed', 'Shipped', 'Delivered', 'Failed', 'Cancelled', 'Returned'].map(status => (
                    <button
                      key={status}
                      onClick={async () => {
                        try {
                          const requestBody: Record<string, unknown> = {
                            orderId: order.orderId,
                            orderStatus: status
                          };
                          
                          // Add userId if user is authenticated
                          if (user?.id) {
                            requestBody.userId = user.id;
                          }

                          const response = await fetch('/api/orders', {
                            method: 'PUT',
                            headers: {
                              'Content-Type': 'application/json',
                            },
                            body: JSON.stringify(requestBody),
                          });
                          
                          
                          if (!response.ok) {
                            const errorText = await response.text();
                            throw new Error(`Failed to update order status: ${response.status}`);
                          }
                          
                          const result = await response.json();
                          
                          setOrderStatus(status);
                          setShowStatusDropdown(false);
                          // Mirror ProductCatalog pattern: force full reload so state re-initializes cleanly
                          window.location.href = window.location.href;
                        } catch (error) {
                        }
                      }}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 first:rounded-t-lg last:rounded-b-lg ${
                        orderStatus === status ? 'font-bold text-[#0a61d7] bg-blue-50' : 'text-gray-700'
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            {/* Payment Status (manual) */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowStatusDropdown(false);
                  setShowPaymentDropdown((v) => !v);
                }}
                className={`py-2 px-4 rounded-lg text-sm font-medium min-w-[120px] flex items-center justify-between gap-2 ${getPaymentStatusColor(paymentStatus)}`}
              >
                {paymentStatus}
                <ChevronDown className="w-4 h-4" />
              </button>

              {showPaymentDropdown && (
                <div className="absolute right-0 mt-2 w-40 bg-white border border-[#e6e6e6] rounded-lg shadow z-20">
                  {PAYMENT_STATUS_OPTIONS.map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={async () => {
                        try {
                          const response = await fetch('/api/orders', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              orderId: order.orderId,
                              paymentStatus: status,
                              ...(user?.id ? { userId: user.id } : {}),
                            }),
                          });
                          if (!response.ok) return;
                          setPaymentStatus(status);
                          setShowPaymentDropdown(false);
                          // Mirror ProductCatalog pattern: force full reload so state re-initializes cleanly
                          window.location.href = window.location.href;
                        } catch {
                          // ignore
                        }
                      }}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 first:rounded-t-lg last:rounded-b-lg ${
                        paymentStatus === status ? 'font-bold text-[#0a61d7] bg-blue-50' : 'text-gray-700'
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            
            {/* Edit Button */}
            <button
              onClick={() => setShowEditModal(true)}
              className="flex items-center gap-2 py-2 px-4 rounded-lg text-sm text-black font-medium border border-gray-300 hover:bg-gray-50"
              title="Edit order delivery and contact details"
            >
              <Pencil className="w-4 h-4" /> Edit
            </button>

          </div>
        </div>

        {/* Row 1: Full Width Customer Information */}
        <div className="w-full mb-4">
          <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
            <h2 className="text-md font-semibold text-black mb-4">Customer Information</h2>
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 flex-shrink-0 rounded-full overflow-hidden border-4 border-gray-300 bg-[#0a61d7] flex items-center justify-center text-white text-xl font-bold">
                {buyerAvatar ? (
                  <img src={buyerAvatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-8 h-8" />
                )}
              </div>
              <div className="flex-1">
                <h3 className="text-md font-semibold text-gray-900 flex flex-wrap items-center gap-3">
                  {contactPersonDisplay}
                  {buyerIdDisplay && (
                    <Link
                      href={buyerHref}
                      className="text-[#0a61d7] text-xs font-semibold hover:text-blue-800 flex items-center gap-1"
                      title="View buyer profile"
                    >
                      View buyer profile
                      <ArrowRight className="w-4 h-4" aria-hidden />
                    </Link>
                  )}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 text-xs">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-gray-600">Store Name:</span>
                      <span className="text-black font-medium">{storeNameDisplay}</span>
                    </div>
                    <div className='flex items-center justify-between gap-2'>
                      <span className="text-gray-600">Phone:</span>
                      <span className="text-black font-medium">{contactPhoneDisplay}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className='flex items-center justify-between gap-2'>
                      <span className="text-gray-600">Email:</span>
                      <span className="text-black font-medium">{customerEmailDisplay || 'No customer email'}</span>
                    </div>
                    <div className='flex items-center justify-between gap-2'>
                      <span className="text-gray-600">Order Date:</span>
                      <span className="text-black font-medium">{(orderDateDisplay instanceof Date ? orderDateDisplay : new Date(orderDateDisplay)).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Row 2: Total Order and Delivery Service side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          
          {/* Total Order Section */}
          <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
            {/* Total Order Header */}
            <div>
              <div className="text-md font-semibold text-black mb-2">Total Order</div>
              <div className="text-2xl font-bold text-[#0a61d7] mb-3">{formatCurrency(calculateTotalAmount(), user?.currency)}</div>
            </div>

            {/* Payment Authorization Card */}
            <div className="bg-gray-50 rounded-lg p-4 border border-[#e6e6e6] mb-4">
              <div className="flex items-center justify-between mb-2 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="text-sm font-semibold text-black">{paymentMethodLabel}</div>
                  <div className="text-sm text-gray-600">{paymentMethodSubtitle}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {showPaymentProof && (
                    <button
                      type="button"
                      onClick={() => setShowPaymentProofModal(true)}
                      className="px-2.5 py-1 rounded text-xs font-semibold text-[#0a61d7] border border-[#0a61d7] bg-white hover:bg-blue-50 whitespace-nowrap"
                    >
                      Payment proof
                    </button>
                  )}
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getPaymentStatusColor(order.paymentStatus)}`}>
                    {order.paymentStatus.toUpperCase()}
                  </span>
                </div>
              </div>
              <div className="text-xs text-gray-500">
                {showPaymentProof && order.paymentStatus === 'Unpaid'
                  ? 'Buyer submitted payment proof. Verify the transfer and mark as Paid when received.'
                  : order.paymentStatus === 'Paid'
                    ? 'Payment processed successfully. This transaction has been authorized for future reference.'
                    : 'Awaiting payment from the buyer.'}
              </div>
            </div>

            {/* Order Details List */}
            <div>
              <div className="text-sm font-semibold text-gray-500 mb-3">Order Details</div>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Order price:</span>
                  <span className="font-medium text-black">{formatCurrency(calculateSubtotal(), user?.currency)}</span>
                </div>
                <div className="flex justify-between items-start gap-3">
                  <div className="flex flex-col">
                    <span className="text-gray-600">Shipping cost:</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="font-medium text-black">Agreed separately</span>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Currency:</span>
                  <span className="font-medium text-black">{user?.currency || getDefaultCurrency()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Payment Terms:</span>
                  <span className="text-black font-medium">{order.paymentTerms}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Delivery Method:</span>
                  <span className="text-black font-medium">{order.deliveryMethod}</span>
                </div>
              </div>
            </div>

            {shouldShowScheduleNotice && formattedSchedule ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
                <div className="text-sm font-semibold text-yellow-700 mb-1">
                  {isPickupMethod
                    ? 'Scheduled Pickup'
                    : isBuyerCourier
                    ? 'Scheduled Courier Pickup'
                    : 'Scheduled Delivery'}
                </div>
                <div className="text-xs text-yellow-600">
                  {isPickupMethod
                    ? 'Pickup has been scheduled for'
                    : isBuyerCourier
                    ? 'Courier pickup has been scheduled for'
                    : 'Delivery has been scheduled for'}{' '}
                  <span className="font-semibold">{formattedSchedule}</span>
                </div>
              </div>
            ) : null}

            {/* Service Provider Card */}
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200 mt-4">
              <div className="text-sm font-semibold text-blue-800 mb-1">Delivery Service</div>
              <div className="text-lg font-bold text-blue-900 mb-2">{order.assignedLogistics || 'No delivery service assigned'}</div>
              <div className="text-xs space-y-2">
                <div>
                  <span className="text-blue-700">Estimated delivery:</span>
                  <span className="ml-2 font-medium text-blue-900">
                    {orderWithDuration.estimatedDeliveryDate
                      ? new Date(orderWithDuration.estimatedDeliveryDate as string | Date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
                      : 'Not set'}
                    {orderWithDuration.estimatedDeliveryMinDays != null && orderWithDuration.estimatedDeliveryMaxDays != null && (
                      <span className="ml-1 text-blue-600">
                        ({orderWithDuration.estimatedDeliveryMinDays}–{orderWithDuration.estimatedDeliveryMaxDays} days)
                      </span>
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-blue-700">Preferred Time:</span>
                  <span className="ml-2 font-medium text-blue-900">{order.preferredDeliveryTime || 'No preferred delivery time'}</span>
                </div>
                <div>
                  <span className="text-blue-700">Tracking:</span>
                  {order.fleetId != null && order.trackingNumber ? (
                    <Link
                      href={`/logistics/details?id=${order.fleetId}`}
                      className="ml-2 font-semibold text-[#0a61d7] hover:text-[#084ba6] underline focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:ring-offset-1 rounded"
                      title="View fleet details"
                    >
                      {order.trackingNumber.replace(/^#/, '')}
                    </Link>
                  ) : (
                    <span className="ml-2 font-semibold text-blue-900">{(order.trackingNumber || '').replace(/^#/, '') || 'No tracking number'}</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Delivery Service Section */}
          <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
            <h2 className="text-md font-semibold text-black mb-4">Updates and Status</h2>
            
            {/* GPS Map */}
            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-black">Delivery Location</h3>
                {geocodeResult?.coordinates && !isGeocoding && (
                  <button
                    type="button"
                    onClick={() => setShowMapFullscreen(true)}
                    className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                    title="View map full screen"
                    aria-label="View delivery map full screen"
                  >
                    <Maximize2 className="h-5 w-5" />
                  </button>
                )}
              </div>
              {isGeocoding ? (
                <div className="bg-gray-100 rounded-lg h-80 flex items-center justify-center">
                  <div className="text-center">
                    <Loader2 className="w-8 h-8 text-gray-400 mx-auto mb-2 animate-spin" />
                    <p className="text-gray-500 text-sm">Loading map...</p>
                    <p className="text-xs text-gray-400">Geocoding address</p>
                  </div>
                </div>
              ) : geocodeResult?.coordinates ? (
                <MapComponent
                  accessToken={mapboxToken}
                  markers={[{
                    id: order.id,
                    coordinates: geocodeResult.coordinates,
                    label: `${order.orderId} - ${order.orderStatus}`,
                    color: getOrderStatusMarkerColor(order.orderStatus),
                  }]}
                  center={geocodeResult.coordinates}
                  zoom={14}
                  height="320px"
                  showControls={true}
                />
              ) : (
                <div className="bg-gray-100 rounded-lg h-80 flex items-center justify-center">
              <div className="text-center">
                <MapPin className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-500 text-sm">Map unavailable</p>
                    <p className="text-xs text-gray-400">Unable to locate address</p>
              </div>
                </div>
              )}
            </div>

            {/* Store & Address */}
            <div className="mb-4 border-b border-[#e6e6e6] pb-4 mb-4">
              <span className="font-semibold text-sm text-black">{storeNameDisplay}</span>
              <p className="text-xs font-medium text-gray-600 mt-1">{deliveryAddressDisplay}</p>
              <p className="text-xs font-medium text-gray-600 mt-1 italic">Note: {order.deliveryNote}</p>
            </div>

            {/* Proof of Delivery / Cancellation / Return */}
            {(() => {
              if (orderStatus === 'Failed') {
                const raw = order.cancellationReason || '';
                const cleaned = raw.replace(/^\[Delivery failed\]\s*/i, '') || 'Delivery failed';
                const failedReasons = (
                  order as OrderWithSnapshots & { orderFailedReasons?: Array<{ imageUrls?: string[] }> }
                ).orderFailedReasons;
                const latestFailed = failedReasons?.[failedReasons.length - 1];
                const failedImageUrls = (latestFailed?.imageUrls ?? []).filter((u) => typeof u === 'string' && u);
                return (
                  <div className="mb-4 p-4 rounded-lg border bg-gray-50 border-[#e6e6e6]">
                    <div className="text-sm font-semibold text-black mb-2">Delivery failure reason</div>
                    <div className="text-xs text-gray-700 space-y-1">
                      <p>
                        <span className="font-medium text-gray-900">Reason:</span> {cleaned}
                      </p>
                    </div>
                    {failedImageUrls.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {failedImageUrls.slice(0, 5).map((url, imgIdx) => (
                          <a
                            key={`failed-${order.orderId}-${imgIdx}`}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="block w-16 h-16 rounded-md overflow-hidden border border-gray-200"
                          >
                            <img
                              src={url}
                              alt={`Failure evidence ${imgIdx + 1}`}
                              className="w-full h-full object-cover"
                            />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              if (orderStatus === 'Cancelled') {
                return (
                  <div className="mb-4 p-4 rounded-lg border bg-gray-50 border-[#e6e6e6]">
                    <div className="text-sm font-semibold text-black mb-2">Reason for cancellation</div>
                    {order.cancellationReason ? (
                      <div className="text-xs text-gray-700 space-y-1">
                        <p>
                          <span className="font-medium text-gray-900">Reason:</span> {order.cancellationReason}
                        </p>
                        {order.cancelledAt && (
                          <p>
                            <span className="font-medium text-gray-900">Date:</span>{' '}
                            {new Date(order.cancelledAt).toLocaleString()}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-600">No cancellation reason recorded.</p>
                    )}
                  </div>
                );
              }

              if (order.returnRequests && order.returnRequests.length > 0) {
                return (
                  <div className="mb-4 p-4 rounded-lg border bg-gray-50 border-[#e6e6e6]">
                    <div className="text-sm font-semibold text-black mb-2">Return information</div>
                    <div className="text-xs text-gray-700 space-y-3">
                      {order.returnRequests.map((rr, index) => (
                        <div key={rr.id ?? index} className="border border-gray-200 rounded-lg p-2 mb-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-gray-900">
                              Reason {index + 1}: {getReturnReasonLabel(rr.reason)}
                              {rr.reasonDetail ? ` — ${rr.reasonDetail}` : ''}
                            </span>
                            <span
                              className={`px-2 py-1 rounded-full text-[10px] font-semibold ${
                                rr.status === 'Accepted'
                                  ? 'bg-green-100 text-green-700'
                                  : rr.status === 'Rejected'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-yellow-100 text-yellow-700'
                              }`}
                            >
                              {rr.status}
                            </span>
                          </div>
                          <p className="text-gray-500 mb-1">
                            {new Date(rr.createdAt).toLocaleString()}
                          </p>
                          {rr.imageUrls && rr.imageUrls.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-1">
                              {rr.imageUrls.slice(0, 5).map((url, imgIdx) => (
                                <a
                                  key={`${rr.id}-${imgIdx}`}
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block w-16 h-16 rounded-md overflow-hidden border border-gray-200"
                                >
                                  <img
                                    src={url}
                                    alt={`Return evidence ${imgIdx + 1}`}
                                    className="w-full h-full object-cover"
                                  />
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}

                      {latestPendingReturnRequest && (
                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={async () => {
                              if (!latestPendingReturnRequest?.id || !user?.id || isProcessingReturn) return;
                              setIsProcessingReturn(true);
                              try {
                                const res = await fetch('/api/orders', {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    returnRequestId: latestPendingReturnRequest.id,
                                    returnRequestStatus: 'Accepted',
                                    userId: user.id,
                                  }),
                                });
                                if (!res.ok) {
                                  const text = await res.text().catch(() => '');
                                  alert(`Failed to accept return: ${text || res.status}`);
                                  return;
                                }
                                const updated = await res.json().catch(() => null);
                                if (updated?.status === 'Accepted') {
                                  // Optimistically reflect in UI
                                  latestPendingReturnRequest.status = 'Accepted';
                                  setOrderStatus('Returned');
                                }
                                window.location.reload();
                              } catch (err) {
                                alert('Failed to accept return. Please try again.');
                              } finally {
                                setIsProcessingReturn(false);
                              }
                            }}
                            disabled={isProcessingReturn}
                            className={`px-3 py-1 rounded-md text-white text-xs font-semibold ${
                              isProcessingReturn
                                ? 'bg-green-400 cursor-not-allowed opacity-70'
                                : 'bg-green-600 hover:bg-green-700'
                            }`}
                          >
                            {isProcessingReturn ? 'Processing...' : 'Accept return'}
                          </button>
                          <button
                            onClick={async () => {
                              if (!latestPendingReturnRequest?.id || !user?.id || isProcessingReturn) return;
                              setIsProcessingReturn(true);
                              try {
                                const res = await fetch('/api/orders', {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    returnRequestId: latestPendingReturnRequest.id,
                                    returnRequestStatus: 'Rejected',
                                    userId: user.id,
                                  }),
                                });
                                if (!res.ok) {
                                  const text = await res.text().catch(() => '');
                                  alert(`Failed to reject return: ${text || res.status}`);
                                  return;
                                }
                                const updated = await res.json().catch(() => null);
                                if (updated?.status === 'Rejected') {
                                  latestPendingReturnRequest.status = 'Rejected';
                                }
                                window.location.reload();
                              } catch (err) {
                                alert('Failed to reject return. Please try again.');
                              } finally {
                                setIsProcessingReturn(false);
                              }
                            }}
                            disabled={isProcessingReturn}
                            className={`px-3 py-1 rounded-md text-white text-xs font-semibold ${
                              isProcessingReturn
                                ? 'bg-red-400 cursor-not-allowed opacity-70'
                                : 'bg-red-600 hover:bg-red-700'
                            }`}
                          >
                            {isProcessingReturn ? 'Processing...' : 'Reject return'}
                          </button>
                        </div>
                      )}
                    {order.pod && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <div className="text-sm font-semibold text-black mb-2">Proof of Delivery (POD)</div>
                        {String(order.pod).startsWith('data:') ? (
                          <button
                            type="button"
                            className="inline-block px-3 py-2 text-xs font-semibold text-white bg-[#0a61d7] rounded-lg hover:bg-[#084ba6]"
                            onClick={() => setShowPodPreview(true)}
                          >
                            View Proof of Delivery
                          </button>
                        ) : (
                          <a
                            href={order.pod as string}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-block px-3 py-2 text-xs font-semibold text-white bg-[#0a61d7] rounded-lg hover:bg-[#084ba6]"
                          >
                            View Proof of Delivery
                          </a>
                        )}
                      </div>
                    )}
                    {!order.pod &&
                      (POD_TRACKING_STATUSES as readonly string[]).includes(orderStatus) && (
                        <div className="mt-4 pt-4 border-t border-dashed border-gray-200 text-xs text-gray-600">
                          No proof of delivery on file. Upload via <span className="font-semibold">Edit</span>{' '}
                          to keep distributor records (Delivered, Received, or Returned).
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              if (order.pod && !(order.returnRequests && order.returnRequests.length > 0)) {
                return (
                  <div className="mb-4">
                    <div className="text-sm font-semibold text-black mb-2">Proof of Delivery (POD)</div>
                    {String(order.pod).startsWith('data:') ? (
                      <button
                        type="button"
                        className="inline-block px-3 py-2 text-xs font-semibold text-white bg-[#0a61d7] rounded-lg hover:bg-[#084ba6]"
                        onClick={() => setShowPodPreview(true)}
                      >
                        View Proof of Delivery
                      </button>
                    ) : (
                      <a
                        href={order.pod as string}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block px-3 py-2 text-xs font-semibold text-white bg-[#0a61d7] rounded-lg hover:bg-[#084ba6]"
                      >
                        View Proof of Delivery
                      </a>
                    )}
                  </div>
                );
              }

              if (
                !order.pod &&
                (POD_TRACKING_STATUSES as readonly string[]).includes(orderStatus)
              ) {
                return (
                  <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-[#e6e6e6] text-xs text-gray-600">
                    No proof of delivery on file. Upload via <span className="font-semibold">Edit</span> to
                    keep distributor records — recommended for orders marked{' '}
                    <span className="font-semibold text-green-600">Delivered</span>,{' '}
                    <span className="font-semibold text-emerald-700">Received</span>, or{' '}
                    <span className="font-semibold text-amber-700">Returned</span>.
                  </div>
                );
              }

              return null;
            })()}
          </div>
        </div>

        {/* Row 3: Order Items and Order Summary side by side (3:4 ratio) */}
        <div className="grid grid-cols-1 lg:grid-cols-7 gap-4">
          
          {/* Order Items Section (3 columns) */}
          <div className="lg:col-span-3 bg-white rounded-lg border border-[#e6e6e6] p-4">
            <h2 className="text-md font-semibold text-black mb-4">Order Items</h2>
            <div className="space-y-2">
              {order.orderItems.slice(0, 4).map((item, index) => (
                <div key={index} className="flex items-center gap-3 p-3">
                  {/* Product Image or Placeholder */}
                  <div className="w-14 h-14 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {item.images && item.images.length > 0 ? (
                      <img 
                        src={item.images[0]} 
                        alt={item.productName}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          // Fallback to package icon if image fails to load
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent) {
                            const packageIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                            packageIcon.setAttribute("class", "w-6 h-6 text-gray-400");
                            packageIcon.setAttribute("width", "24");
                            packageIcon.setAttribute("height", "24");
                            packageIcon.setAttribute("viewBox", "0 0 24 24");
                            packageIcon.setAttribute("fill", "none");
                            packageIcon.setAttribute("stroke", "currentColor");
                            packageIcon.innerHTML = '<path d="M16 16l3-8 3 8c-1.3-1.3-4.7-1.3-6 0z"/><path d="M2 16l3-8 3 8c-1.3-1.3-4.7-1.3-6 0z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>';
                            parent.appendChild(packageIcon);
                          }
                        }}
                      />
                    ) : (
                      <Package className="w-6 h-6 text-gray-400" />
                    )}
                  </div>
                  
                  {/* Item Details */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-xs font-semibold transition-colors">
                        <Link
                          href={item.productId ? `/products/catalog/${item.productId}` : `/products/deleted?id=${item.productSkuSnapshot || ''}`}
                          className="text-[#0a61d7] hover:text-blue-800 focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:ring-offset-1 rounded"
                          title="Click to view product details"
                        >
                          <span className="flex flex-col">
                            <span>{item.productName}</span>
                            {item.variantNameSnapshot && (
                              <span className="text-gray-600 text-xs mt-0.5 font-normal">{item.variantNameSnapshot}</span>
                            )}
                          </span>
                        </Link>
                      </h3>
                      
                    </div>
                    {/* Removed SKU label per requirements */}
                    
                    {/* Quantity with promotion details under SKU */}
                    <p className="text-xs text-gray-600">
                      Qty: {item.packageQuantity || 1} {item.packageType || 'Package'}
                      {item.offerApplied && item.promotionDetailsSnapshot && (() => {
                        // Only show promotion details if available
                        try {
                          const promoDetails = JSON.parse(item.promotionDetailsSnapshot);
                          if (promoDetails.minQuantity && promoDetails.freeQuantity) {
                            // Extract MOQ from promotion details (same as Marketplace)
                            const moq = promoDetails.moq || item.moqSnapshot || null;
                            const promotionGift = calculateOrderItemPromotion(
                              promoDetails,
                              item.packageQuantity || 1,
                              item.piecesPerPackage || 1,
                              moq
                            );
                            return promotionGift ? (
                              <span className="font-bold text-purple-600"> (+ {promotionGift.freeQty} free pieces)</span>
                            ) : '';
                          }
                        } catch {
                          // Invalid JSON, skip
                        }
                        return '';
                      })()}
                    </p>
                  </div>
                  
                  {/* Package Information */}
                  <div className="text-right">
                    {/* Discount badge above per Box price */}
                    {item.offerApplied && (item.discountPercentage || item.discountAmount) && (
                      <div className="mb-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 border border-red-200 rounded text-xs font-semibold text-red-600">
                          <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                          {item.discountPercentage 
                            ? `${item.discountPercentage}% OFF`
                            : item.discountAmount 
                            ? `${formatCurrency(item.discountAmount, user?.currency)} OFF`
                            : 'OFF'
                          }
                        </span>
                      </div>
                    )}
                    <p className="text-xs text-gray-500">
                      {formatCurrency(item.pricePerPackage || 0, user?.currency)}
                    </p>
                    <p className="text-sm font-semibold text-black">
                      {formatCurrency(item.subtotal, user?.currency)}
                    </p>
                  </div>
                </div>
              ))}
              
              {/* See More Button */}
              {order.orderItems && order.orderItems.length > 4 && (
                <div className="pt-2">
                  <button
                    onClick={() => setShowAllItems(true)}
                    className="w-full py-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
                  >
                    See More ({order.orderItems.length - 4} more items)
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Order Summary Section (4 columns) */}
          <div className="lg:col-span-4 bg-white rounded-lg border border-[#e6e6e6] p-4">
            <h2 className="text-md font-semibold text-black mb-4">Order Summary</h2>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              {/* Total Quantity Card */}
              <div className="bg-green-100 rounded-lg p-3 border border-[#e6e6e6]">
                <div className="text-sm text-gray-600 font-medium mb-1">Total Quantity Ordered</div>
                <div className="text-lg font-bold text-black">
                  {order.orderItems.reduce((total, item) => total + (item.packageQuantity || 1), 0)} 
                </div>
              </div>
              
              {/* Total Free Quantity Card */}
              <div className="bg-gray-50 rounded-lg p-3 border border-[#e6e6e6]">
                <div className="text-sm text-gray-600 font-medium mb-1">Total Free Quantity</div>
                <div className="text-lg font-bold text-purple-600">
                  {order.orderItems.reduce((total, item) => {
                    if (item.offerApplied && item.promotionDetailsSnapshot) {
                      try {
                        const promoDetails = JSON.parse(item.promotionDetailsSnapshot);
                        if (promoDetails.minQuantity && promoDetails.freeQuantity) {
                          const moq = promoDetails.moq || item.moqSnapshot || null;
                          const promotionGift = calculateOrderItemPromotion(
                            promoDetails,
                            item.packageQuantity || 1,
                            item.piecesPerPackage || 1,
                            moq
                          );
                          return total + (promotionGift?.freeQty || 0);
                        }
                      } catch {
                        // Invalid JSON, skip
                      }
                    }
                    return total;
                  }, 0)} pieces
                </div>
              </div>
            </div>

            {/* Detailed Breakdown Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#e6e6e6] text-gray-500">
                    <th className="text-left py-2 font-medium uppercase">Description</th>
                    <th className="text-left py-2 font-medium uppercase">Pckg Type</th>
                    <th className="text-left py-2 font-medium uppercase">Pcs/Pckg</th>
                    <th className="text-left py-2 font-medium uppercase">Qty</th>
                    <th className="text-left py-2 font-medium uppercase">Price/Pckg</th>
                    <th className="text-right py-2 font-medium uppercase">Total Amount</th>
                    </tr>
                </thead>
                <tbody className="text-black">
                  {currentEarningsItems.map((item, index) => (
                    <tr key={index} className="border-b border-[#e6e6e6]">
                      <td className="py-2">
                        <Link
                          href={item.productId ? `/products/catalog/${item.productId}` : `/products/deleted?id=${item.productSkuSnapshot || ''}`}
                          className="font-semibold text-[#0a61d7] hover:text-blue-800 transition-colors focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:ring-offset-1 rounded"
                          title="Click to view product details"
                        >
                          <span className="flex flex-col">
                            <span>{item.productName}</span>
                            {item.variantNameSnapshot && (
                              <span className="text-gray-600 text-xs mt-0.5 font-normal">{item.variantNameSnapshot}</span>
                            )}
                          </span>
                        </Link>
                      </td>
                      <td className="py-2">{item.packageType || 'Package'}</td>
                      <td className="py-2">{item.piecesPerPackage || 1}</td>
                      <td className="py-2">
                        {item.packageQuantity || 1}
                        {item.offerApplied && item.promotionDetailsSnapshot && (() => {
                          // Only show promotion details if available
                          try {
                            const promoDetails = JSON.parse(item.promotionDetailsSnapshot);
                            if (promoDetails.minQuantity && promoDetails.freeQuantity) {
                              // Extract MOQ from promotion details (same as Marketplace)
                              const moq = promoDetails.moq || item.moqSnapshot || null;
                              const promotionGift = calculateOrderItemPromotion(
                                promoDetails,
                                item.packageQuantity || 1,
                                item.piecesPerPackage || 1,
                                moq
                              );
                              return promotionGift ? (
                                <span className="font-bold text-purple-600"> (+ {promotionGift.freeQty} free pieces)</span>
                              ) : '';
                            }
                          } catch {
                            // Invalid JSON, skip
                          }
                          return '';
                        })()}
                      </td>
                      <td className="py-2">{formatCurrency(item.pricePerPackage || 0, user?.currency)}</td>
                      <td className="py-2 text-right font-medium">{formatCurrency(item.subtotal, user?.currency)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-300">
                    <td colSpan={5} className="py-3 text-lg font-semibold text-gray-900">Total price</td>
                    <td className="py-3 text-right font-bold text-lg text-gray-900">
                      {formatCurrency(calculateSubtotal(), user?.currency)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Pagination Controls */}
              {totalEarningsPages > 1 && (
                <div className="flex justify-center items-center gap-2 mt-4">
                  <button
                    onClick={() => setEarningsPage(prev => Math.max(1, prev - 1))}
                    disabled={earningsPage === 1}
                    className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-600">
                    Page {earningsPage} of {totalEarningsPages}
                  </span>
                  <button
                    onClick={() => setEarningsPage(prev => Math.min(totalEarningsPages, prev + 1))}
                    disabled={earningsPage === totalEarningsPages}
                    className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              )}
          </div>
        </div>
      </div>
      
      {/* All Items Modal */}
      {showAllItems && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-[#e6e6e6]">
              <h2 className="text-xl font-semibold text-gray-900">All Order Items</h2>
              <button
                onClick={() => setShowAllItems(false)}
                className="text-gray-700 hover:bg-gray-200 rounded-lg p-2 transition-colors"
              >
                <X className="w-6 h-6"/>
              </button>
            </div>
            
            {/* Modal Content */}
            <div className="p-4 overflow-y-auto max-h-[80vh]">
              <div className="space-y-3">
                {order.orderItems.map((item, index) => (
                  <div key={index} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                    {/* Image Placeholder */}
                    <div className="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Package className="w-8 h-8 text-gray-400" />
                    </div>
                    
                    {/* Item Details */}
                    <div className="flex-1">
                      <h3 className="text-base font-medium transition-colors">
                        <Link
                          href={`/products/catalog/${item.productId}`}
                          className="text-blue-600 hover:text-blue-800 hover:underline focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:ring-offset-1 rounded"
                          title="Click to view product details"
                        >
                          <span className="flex flex-col">
                            <span>{item.productName}</span>
                            {item.variantNameSnapshot && (
                              <span className="text-gray-600 text-xs mt-0.5 font-normal">{item.variantNameSnapshot}</span>
                            )}
                          </span>
                        </Link>
                      </h3>
                      {/* Removed SKU label per requirements */}
                      
                      {/* Quantity with promotion details under SKU */}
                      <p className="text-sm text-gray-600">
                        Qty: {item.packageQuantity || 1} {item.packageType || 'Package'}
                        {item.offerApplied && item.promotionDetailsSnapshot && (() => {
                          // Only show promotion details if available
                          try {
                            const promoDetails = JSON.parse(item.promotionDetailsSnapshot);
                            if (promoDetails.minQuantity && promoDetails.freeQuantity) {
                              // Extract MOQ from promotion details (same as Marketplace)
                              const moq = promoDetails.moq || item.moqSnapshot || null;
                              const promotionGift = calculateOrderItemPromotion(
                                promoDetails,
                                item.packageQuantity || 1,
                                item.piecesPerPackage || 1,
                                moq
                              );
                              return promotionGift ? ` (+ ${promotionGift.freeQty} free pieces)` : '';
                            }
                          } catch {
                            // Invalid JSON, skip
                          }
                          return '';
                        })()}
                      </p>
                      
                      <p className="text-sm text-gray-600">Category: {item.productTypeSnapshot || 'Uncategorized'}</p>
                    </div>
                    
                    {/* Package Information */}
                    <div className="text-right">
                      {/* Discount badge above per package price */}
                      {item.offerApplied && (item.discountPercentage || item.discountAmount) && (
                        <div className="mb-1">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 border border-red-200 rounded text-xs font-semibold text-red-600">
                            <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                            {item.discountPercentage 
                              ? `${item.discountPercentage}% OFF`
                              : item.discountAmount 
                              ? `${formatCurrency(item.discountAmount, user?.currency)} OFF`
                              : 'OFF'
                            }
                          </span>
                        </div>
                      )}
                      <p className="text-sm text-gray-500">
                        {item.piecesPerPackage || 1} pieces per {item.packageType || 'package'}
                      </p>
                      <p className="text-sm font-medium text-gray-900">
                        {formatCurrency(item.pricePerPackage || 0, user?.currency)} per package
                      </p>
                      <p className="text-lg font-semibold text-[#0a61d7]">{formatCurrency(item.subtotal, user?.currency)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Order Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-[#e6e6e6]">
              <h2 className="text-xl font-semibold text-gray-900">Edit Order</h2>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-gray-700 hover:bg-gray-200 rounded-lg p-2 transition-colors"
                aria-label="Close edit order"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[70vh]">
              <p className="p-4 bg-orange-50 rounded-lg border border-orange-200 text-xs text-orange-600 mb-3 italic">
                *Please complete these order details. Updates here will be shared with buyers so they receive the latest delivery and contact information.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500">Contact Person</label>
                  <input
                    className="w-full mt-1 px-3 py-2 text-xs text-black border border-gray-300 rounded-lg"
                    placeholder="e.g. Store owner or PIC name"
                    value={formFields.contactPerson}
                    onChange={(e) => setFormFields({ ...formFields, contactPerson: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Contact Phone</label>
                  <input
                    className="w-full mt-1 px-3 py-2 text-xs text-black border border-gray-300 rounded-lg"
                    placeholder="e.g. 0812-3456-7890"
                    value={formFields.contactPhone}
                    onChange={(e) => setFormFields({ ...formFields, contactPhone: e.target.value })}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-gray-500">Delivery Address</label>
                  <input
                    className="w-full mt-1 px-3 py-2 text-xs text-black border border-gray-300 rounded-lg"
                    placeholder="Street, City, Province, Postal Code"
                    value={formFields.deliveryAddress}
                    onChange={(e) => setFormFields({ ...formFields, deliveryAddress: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Preferred Delivery Time</label>
                  <input
                    className="w-full mt-1 px-3 py-2 text-xs text-black border border-gray-300 rounded-lg"
                    placeholder="e.g. 09:00 - 12:00"
                    value={formFields.preferredDeliveryTime}
                    onChange={(e) => setFormFields({ ...formFields, preferredDeliveryTime: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Estimated delivery date</label>
                  <input
                    type="date"
                    className="w-full mt-1 px-3 py-2 text-xs text-black border border-gray-300 rounded-lg"
                    value={formFields.estimatedDeliveryDate}
                    onChange={(e) => setFormFields({ ...formFields, estimatedDeliveryDate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Estimated delivery duration (days)</label>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <input
                      type="number"
                      min={0}
                      max={365}
                      placeholder="Min"
                      className={`w-full max-w-[72px] px-3 py-2 text-xs text-black border rounded-lg ${durationError ? 'border-red-500' : 'border-gray-300'}`}
                      value={formFields.estimatedDeliveryMinDays}
                      onChange={(e) => {
                        setFormFields({ ...formFields, estimatedDeliveryMinDays: e.target.value });
                        setDurationError(null);
                      }}
                    />
                    <span className="text-xs text-gray-500">to</span>
                    <input
                      type="number"
                      min={0}
                      max={365}
                      placeholder="Max"
                      className={`w-full max-w-[72px] px-3 py-2 text-xs text-black border rounded-lg ${durationError ? 'border-red-500' : 'border-gray-300'}`}
                      value={formFields.estimatedDeliveryMaxDays}
                      onChange={(e) => {
                        setFormFields({ ...formFields, estimatedDeliveryMaxDays: e.target.value });
                        setDurationError(null);
                      }}
                    />
                    <span className="text-xs text-gray-500">days</span>
                  </div>
                  {durationError && (
                    <p className="mt-1 text-xs text-red-600" role="alert">{durationError}</p>
                  )}
                </div>
                <div className="relative" ref={deliveryMethodDropdownRef}>
                  <label className="text-xs text-gray-500">Delivery Method</label>
                  <button
                    type="button"
                    className="w-full mt-1 flex items-center justify-between gap-2 px-3 py-2 text-xs text-black border border-gray-300 rounded-lg bg-white hover:bg-gray-50 text-left"
                    onClick={() => setShowDeliveryMethodDropdown((v) => !v)}
                  >
                    <span>{formFields.deliveryMethod}</span>
                    <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  </button>
                  {showDeliveryMethodDropdown && (
                    <div className="absolute left-0 right-0 mt-1 bg-white border border-[#e6e6e6] rounded-lg shadow-lg z-20 overflow-hidden">
                      {(['Self Pickup', 'Seller/Distributor Delivery', 'Buyer-arranged Courier'] as const).map((method) => (
                        <button
                          key={method}
                          type="button"
                          onClick={() => {
                            setFormFields({ ...formFields, deliveryMethod: method });
                            setShowDeliveryMethodDropdown(false);
                          }}
                          className={`w-full text-left px-4 py-2 text-xs first:rounded-t-lg last:rounded-b-lg transition-colors ${
                            formFields.deliveryMethod === method
                              ? 'bg-[#0a61d7] text-white font-medium'
                              : 'text-black hover:bg-gray-100'
                          }`}
                        >
                          {method}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500">Assigned Logistics</label>
                  <input
                    className="w-full mt-1 px-3 py-2 text-xs text-black border border-gray-300 rounded-lg"
                    placeholder="e.g. JNE / Internal Fleet / Vendor name"
                    value={formFields.assignedLogistics}
                    onChange={(e) => setFormFields({ ...formFields, assignedLogistics: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Tracking Number</label>
                  <input
                    className="w-full mt-1 px-3 py-2 text-xs text-black border border-gray-300 rounded-lg"
                    placeholder="e.g. 1Z999AA10123456784"
                    value={formFields.trackingNumber}
                    onChange={(e) => setFormFields({ ...formFields, trackingNumber: e.target.value })}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-gray-500">Delivery Note</label>
                  <textarea
                    className="w-full mt-1 px-3 py-2 text-xs text-black border border-gray-300 rounded-lg"
                    rows={3}
                    placeholder="Notes for driver or warehouse (e.g. fragile, gate access)"
                    value={formFields.deliveryNote}
                    onChange={(e) => setFormFields({ ...formFields, deliveryNote: e.target.value })}
                  />
                </div>
                {(POD_TRACKING_STATUSES as readonly string[]).includes(orderStatus) && (
                  <div className="md:col-span-2">
                    <label className="text-xs text-gray-500">Proof of Delivery (POD)</label>
                    <div
                      className="mt-1 p-6 bg-gray-50 rounded-lg border border-dashed border-gray-300 text-center cursor-pointer select-none"
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const file = e.dataTransfer.files?.[0];
                        if (file) handlePodUpload(file);
                      }}
                      onClick={() => document.getElementById('pod-file-input')?.click()}
                      role="button"
                      aria-label="Upload proof of delivery by clicking or dragging a file"
                    >
                      <input
                        id="pod-file-input"
                        type="file"
                        accept="image/*,application/pdf"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handlePodUpload(file);
                        }}
                      />
                      <div className="text-xs text-gray-600">
                        {podFileName ? (
                          <span className="font-medium">POD selected: {podFileName}</span>
                        ) : formFields.pod ? (
                          <span className="font-medium">Existing POD selected</span>
                        ) : (
                          <>
                            <span className="font-medium text-gray-700">Drag & drop</span> a file here, or <span className="text-[#0a61d7] font-semibold">browse</span>
                          </>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-500 mt-1">Accepted: JPG, PNG, PDF.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-[#e6e6e6] flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setDurationError(null);
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium text-black border border-gray-300 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setDurationError(null);
                  const minRaw = formFields.estimatedDeliveryMinDays === '' ? null : formFields.estimatedDeliveryMinDays;
                  const maxRaw = formFields.estimatedDeliveryMaxDays === '' ? null : formFields.estimatedDeliveryMaxDays;
                  const minNum = minRaw != null && minRaw !== '' ? Number(minRaw) : null;
                  const maxNum = maxRaw != null && maxRaw !== '' ? Number(maxRaw) : null;

                  if (minNum != null && maxNum != null && !Number.isNaN(minNum) && !Number.isNaN(maxNum) && minNum > maxNum) {
                    setDurationError('Min days cannot be greater than max days. Please correct the values.');
                    return;
                  }
                  const minInvalid = minRaw != null && minRaw !== '' && (minNum == null || Number.isNaN(minNum) || minNum < 0);
                  const maxInvalid = maxRaw != null && maxRaw !== '' && (maxNum == null || Number.isNaN(maxNum) || maxNum < 0);
                  if (minInvalid || maxInvalid) {
                    setDurationError('Please enter valid non-negative numbers for min and max days.');
                    return;
                  }

                  const requestBody: Record<string, unknown> = {
                    orderId: order.orderId,
                    deliveryAddress: formFields.deliveryAddress,
                    contactPerson: formFields.contactPerson,
                    contactPhone: formFields.contactPhone,
                    preferredDeliveryTime: formFields.preferredDeliveryTime,
                    estimatedDeliveryDate: formFields.estimatedDeliveryDate ? `${formFields.estimatedDeliveryDate}T12:00:00.000Z` : null,
                    estimatedDeliveryMinDays: minNum,
                    estimatedDeliveryMaxDays: maxNum,
                    deliveryNote: formFields.deliveryNote,
                    assignedLogistics: formFields.assignedLogistics,
                    trackingNumber: formFields.trackingNumber,
                    deliveryMethod: formFields.deliveryMethod,
                    shippingMethodLabel: formFields.deliveryMethod,
                    shippingMethod: formFields.deliveryMethod
                  };
                  if ((POD_TRACKING_STATUSES as readonly string[]).includes(orderStatus) && formFields.pod) {
                    requestBody.pod = formFields.pod;
                    requestBody.deliveryConfirmation = 'delivered';
                  }
                  if (user?.id) requestBody.userId = user.id;
                  const response = await fetch('/api/orders', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                  });
                  if (response.ok) {
                    setShowEditModal(false);
                    setDurationError(null);
                    window.location.reload();
                  }
                }}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[#0a61d7] hover:bg-[#084ba6]"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment proof modal */}
      {showPaymentProofModal && showPaymentProof && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg border border-[#e6e6e6] max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-3 border-b">
              <div>
                <div className="text-lg font-semibold text-black">Payment proof</div>
                {order.paymentProofSubmittedAt && (
                  <div className="text-xs text-gray-500 mt-0.5">
                    Submitted {new Date(order.paymentProofSubmittedAt).toLocaleString()}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="p-2 text-gray-700 hover:bg-gray-100 rounded"
                onClick={() => setShowPaymentProofModal(false)}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex flex-col items-center gap-6">
              {paymentProofUrls.map((url, idx) => {
                const storedName = order.paymentProofFileNames?.[idx] ?? null;
                const displayName = paymentProofDisplayName(url, storedName, order.orderId);
                const downloadName = paymentProofDownloadFilename({
                  orderId: order.orderId,
                  url,
                  storedFileName: storedName,
                });
                const downloadHref = paymentProofDownloadHref(order.orderId, idx);
                const isPdf = isPaymentProofPdfUrl(url);

                return (
                  <div
                    key={`proof-${idx}`}
                    className="w-full flex flex-col items-center gap-4"
                  >
                    {isPdf ? (
                      <div className="w-full max-w-lg flex flex-col items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-6 py-8">
                        <FileText className="w-12 h-12 text-gray-500 flex-shrink-0" />
                        <p className="text-sm font-medium text-gray-900 text-center break-all px-2">
                          {displayName}
                        </p>
                      </div>
                    ) : (
                      <div className="w-full flex justify-center items-center rounded-lg border border-gray-200 bg-gray-50 p-4 min-h-[200px]">
                        <img
                          src={url}
                          alt={`Payment proof ${idx + 1}`}
                          className="max-h-[min(60vh,520px)] max-w-full w-auto object-contain rounded"
                        />
                      </div>
                    )}
                    <a
                      href={downloadHref}
                      download={downloadName}
                      className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-[#0a61d7] hover:bg-[#084ba6] transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Download{isPdf ? ' PDF' : ''}
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* POD Preview Modal */}
      {showPodPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg border border-[#e6e6e6] max-w-3xl w-full overflow-hidden">
            <div className="flex items-center justify-between p-3 border-b">
              <div className="text-lg font-semibold text-black">Proof of Delivery</div>
              <button className="p-2 text-gray-700 hover:bg-gray-100 rounded" onClick={() => setShowPodPreview(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex items-center justify-center">
              <img src={order.pod as string} alt="Proof of Delivery" className="max-h-[80vh] rounded border" />
            </div>
          </div>
        </div>
      )}

      <MapFullscreenModal
        open={showMapFullscreen}
        onClose={() => setShowMapFullscreen(false)}
        title={`Delivery location · ${order.orderId}`}
      >
        {geocodeResult?.coordinates ? (
          <MapComponent
            key="order-details-map-fullscreen"
            accessToken={mapboxToken}
            markers={[
              {
                id: order.id,
                coordinates: geocodeResult.coordinates,
                label: `${order.orderId} - ${order.orderStatus}`,
                color: getOrderStatusMarkerColor(order.orderStatus),
              },
            ]}
            center={geocodeResult.coordinates}
            zoom={14}
            height="100%"
            className="h-full min-h-0 rounded-none border-0"
            showControls={true}
          />
        ) : null}
      </MapFullscreenModal>
    </div>
  );
}

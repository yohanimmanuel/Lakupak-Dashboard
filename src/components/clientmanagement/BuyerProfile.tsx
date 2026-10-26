'use client';

import React from "react";
import { Phone, MapPin, Tag, Truck, Info, Calendar, BarChart2, ArrowLeft, Edit, Copy, Mail, ChevronLeft, ChevronRight, User, Upload, Download, CheckCircle2, AlertTriangle, Plus } from "lucide-react";
import Link from "next/link";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts';
import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import ImportOrdersModal from './ImportOrdersModal';
import { Buyer, OrderDetail } from '@/types/client';
import { formatDate, formatNumber } from '@/utils/dateUtils';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';
import { parseNumberByCurrency } from '@/config/currencyConfig';
import { useUserStore } from '@/store/userStore';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useClientsTranslations } from '@/hooks/useClientsTranslations';
import { useOffersTranslations } from '@/hooks/useOffersTranslations';
import { useRouter } from 'next/navigation';
import type { Offer } from '@/types/offer';
import { formatDiscount } from '@/components/offersincentivesdisc/OfferTable';
import MapFullscreenModal from '@/components/MapFullscreenModal';
import MapComponent from '@/components/ordershipment/MapComponent';
import { useMapboxToken } from '@/hooks/useMapboxToken';
import { geocodeAddress, type GeocodeResult } from '@/utils/mapboxUtils';

type ProfileFieldKey =
  | 'storeName'
  | 'owner'
  | 'address'
  | 'businessType'
  | 'email'
  | 'phone'
  | 'preferredDays'
  | 'lastOrderDate'
  | 'shipmentSuccess'
  | 'orderDetails';

/**
 * Collapse repeated product names into a single entry. Order product strings are
 * stored as a ', '-joined list of per-item product names, so ordering multiple
 * variants of the same product would otherwise repeat the same name.
 */
function dedupeProductNames(product: string | null | undefined): string {
  if (!product) return '';
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const rawName of product.split(',')) {
    const name = rawName.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(name);
  }
  return unique.join(', ');
}

function getBuyerAnalytics(orderDetailsStr: string, locale: string) {
  if (!orderDetailsStr) return [];
  
  try {
    const orderDetails = JSON.parse(orderDetailsStr);
    if (!Array.isArray(orderDetails)) return [];
    
    // Group by month using YYYY-MM format for proper sorting
    const map: { [monthKey: string]: { orders: number; spending: number; date: Date } } = {};
    orderDetails.forEach((order: OrderDetail) => {
      if (!order.lastOrderDate) return;
      const date = new Date(order.lastOrderDate);
      if (isNaN(date.getTime())) return; // Skip invalid dates
      
      // Use YYYY-MM format for proper chronological sorting
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const totalOrders = Number(order.totalOrders) || 0;
      // Remove non-numeric from totalSpend (e.g. 'Rp 12,000,000')
      const spending = Number((order.totalSpend || '').toString().replace(/[^\d]/g, ''));
      
      if (!map[monthKey]) {
        map[monthKey] = { orders: 0, spending: 0, date: new Date(date.getFullYear(), date.getMonth(), 1) };
      }
      map[monthKey].orders += totalOrders;
      map[monthKey].spending += spending;
    });
    
    // Sort months chronologically and format for display
    const sortedEntries = Object.entries(map).sort((a, b) => {
      return a[1].date.getTime() - b[1].date.getTime();
    });
    
    return sortedEntries.map(([monthKey, data]) => ({
      month: data.date.toLocaleDateString(locale, { month: 'long', year: 'numeric' }),
      orders: data.orders,
      spending: data.spending,
    }));
  } catch (error) {
    return [];
  }
}

interface BuyerProfileProps {
  buyer: Buyer;
  onClose?: () => void;
  onUpdate?: () => void;
}

export default function BuyerProfile({ buyer, onClose, onUpdate }: BuyerProfileProps) {
  const user = useUserStore(state => state.user);
  const router = useRouter();
  const { tBuyersProfile, tBuyersModal, tShared, translateStatus } = useClientsTranslations();
  const { translateOfferStatus, tTable: tOffersTable } = useOffersTranslations();
  const dateLocale = user?.language === 'id' ? 'id-ID' : 'en-US';
  const { token: mapboxToken } = useMapboxToken();
  const [showAddressMap, setShowAddressMap] = useState(false);
  const [addressGeocode, setAddressGeocode] = useState<GeocodeResult | null>(null);
  const [isGeocodingAddress, setIsGeocodingAddress] = useState(false);

  const addressText = buyer.address?.trim() || '';
  const hasAddress = Boolean(addressText);

  useEffect(() => {
    if (!hasAddress) {
      setAddressGeocode(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      setIsGeocodingAddress(true);
      try {
        const result = await geocodeAddress(addressText);
        if (!cancelled) setAddressGeocode(result);
      } finally {
        if (!cancelled) setIsGeocodingAddress(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [addressText, hasAddress]);

  // Get user currency for display - safe to use on both server and client
  const userCurrency = user?.currency || getDefaultCurrency();
  const getFieldLabel = (key: ProfileFieldKey) =>
    tBuyersProfile(`fields.${key}` as Parameters<typeof tBuyersProfile>[0]);
  const [showImportOrders, setShowImportOrders] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState('');
  const [updateSuccess, setUpdateSuccess] = useState('');
  const [buyerOffers, setBuyerOffers] = useState<Offer[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);
  
  // BuyerProfile - Raw buyer data
  
  // Parse orderDetails and notes from strings to arrays
  const orderDetails = buyer.orderDetails ? (() => {
    try {
      const parsed = JSON.parse(buyer.orderDetails);
      return parsed;
    } catch (error) {
      return [];
    }
  })() : [];
  
  const notes: string[] = (() => {
    if (!buyer.notes) return [];
    try {
      const parsed: unknown = JSON.parse(buyer.notes);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((item): item is string => typeof item === 'string');
    } catch {
      return [];
    }
  })();

  useEffect(() => {
    if (!user?.id || !buyer.buyerId) return;
    let cancelled = false;
    (async () => {
      setOffersLoading(true);
      try {
        const data = await fetchGraphQL<{ offersForBuyer: Offer[] }>(
          `query OffersForBuyer($userId: Int!, $buyerId: String!) {
            offersForBuyer(userId: $userId, buyerId: $buyerId) {
              id offerId productId productName categoryId categoryLabel
              variantOptionId variantName
              discountType discountValue buyQuantity freeQuantity startDate endDate status notes
            }
          }`,
          { userId: user.id, buyerId: buyer.buyerId },
        );
        if (!cancelled) setBuyerOffers(data.offersForBuyer ?? []);
      } catch {
        if (!cancelled) setBuyerOffers([]);
      } finally {
        if (!cancelled) setOffersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, buyer.buyerId]);
  
  const logistics = buyer.logistics ? (() => {
    try {
      const parsed = JSON.parse(buyer.logistics);
      return parsed;
    } catch (error) {
      return {};
    }
  })() : {};
  
  // BuyerProfile - Final parsed data
  
  const handleCopy = () => {
    let text = '';
    text += `ID: ${buyer.id}\n`;
    text += `Store Name: ${buyer.storeName}\n`;
    text += `Owner: ${buyer.owner}\n`;
    text += `Email: ${buyer.email}\n`;
    text += `Phone: ${buyer.phone}\n`;
    text += `Business Type: ${buyer.businessType}\n`;
    text += `Address: ${buyer.address}\n`;
    text += `Status: ${buyer.status}\n`;
    text += `Created At: ${buyer.createdAt}\n`;
    text += `Preferred Delivery Days: ${logistics?.preferredDays || ''}\n`;
    text += `Last Shipment: ${logistics?.lastShipment || ''}\n`;
    text += `Shipment Success: ${logistics?.shipmentSuccess || ''}\n`;
    text += `Notes: ${notes.join(', ')}\n`;
    text += `\nOrder & Product Details:\n`;
    for (const row of orderDetails) {
      text += `- Order No: ${row.orderNo}, Product: ${dedupeProductNames(row.product)}, Total Orders: ${row.totalOrders}, Total Spend: ${row.totalSpend}, Last Order Date: ${row.lastOrderDate}, Outstanding: ${row.outstanding}\n`;
    }
    navigator.clipboard.writeText(text);
  };
  
  const analyticsData = getBuyerAnalytics(buyer?.orderDetails || '', dateLocale);
  const totalOrders = orderDetails.reduce((sum: number, o: OrderDetail) => sum + (parseInt(o.totalOrders) || 0), 0) || 0;
  let totalSpend = 0;
  let currency = '';
  orderDetails.forEach((o: OrderDetail) => {
    const match = (o.totalSpend || '').toString().match(/^([^\d]*)/);
    if (match && match[1] && !currency) currency = match[1];
    // totalSpend already includes product cost + shipping fee
    totalSpend += parseInt((o.totalSpend || '').toString().replace(/[^\d]/g, '')) || 0;
  });
  const totalOutstanding = orderDetails.reduce((sum: number, o: OrderDetail) => sum + (parseInt((o.outstanding || '').toString().replace(/[^\d]/g, '')) || 0), 0) || 0;
  const [orderPage, setOrderPage] = useState(1);
  const orderRowsPerPage = 5;
  const totalOrderRows = orderDetails.length;
  const totalOrderPages = Math.max(1, Math.ceil(totalOrderRows / orderRowsPerPage));
  const pagedOrderDetails = orderDetails.slice((orderPage - 1) * orderRowsPerPage, orderPage * orderRowsPerPage);

  function handleExportOrders() {
    const headers = ['Product', 'Total Orders', 'Total Spend', 'Last Order Date', 'Outstanding'];
    const rows = orderDetails.map((o: OrderDetail) => [
      dedupeProductNames(o.product),
      o.totalOrders,
      o.totalSpend,
      o.lastOrderDate,
      o.outstanding
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Orders');
    XLSX.writeFile(wb, `${buyer.storeName || 'buyer'}-orders.xlsx`);
  }

  return (
    <div className="mx-auto flex w-full min-w-0 flex-col gap-4 rounded-lg border border-[#e6e6e6] bg-white p-4">
      <div className="mb-2 flex min-w-0 flex-col gap-3 @5xl/main:flex-row @5xl/main:items-center @5xl/main:justify-between">
        <div className="flex min-w-0 flex-col gap-3 @3xl/main:flex-row @3xl/main:items-center">
          <Link
            href="/clients/buyers"
            className="flex w-full shrink-0 items-center justify-center gap-2 rounded-lg px-3 py-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800 @3xl/main:w-auto @3xl/main:justify-start"
          >
            <ArrowLeft className="h-4 w-4" />
            {tBuyersProfile('back')}
          </Link>
          <h2 className="min-w-0 truncate text-2xl font-bold text-black">{tBuyersProfile('title')}</h2>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-2 @4xl/main:flex-row @4xl/main:flex-wrap @4xl/main:items-center @5xl/main:w-auto">
          <button
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#e6e6e6] bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-gray-100 @4xl/main:w-auto"
            onClick={handleCopy}
          >
            <Copy className="h-4 w-4" /> {tBuyersProfile('copyData')}
          </button>
          <Link
            href={`/clients/buyers/edit/${encodeURIComponent(buyer.buyerId)}`}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0a61d7] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#084ba6] @4xl/main:w-auto"
          >
            <Edit className="h-4 w-4" /> {tBuyersProfile('editDetails')}
          </Link>
        </div>
      </div>
      
      {/* Data Completion Progress */}
      {(() => {
        // Check all profile fields for missing data (excluding notes and pictures)
        const basicFields: { key: ProfileFieldKey; value: boolean }[] = [
          { key: 'storeName', value: !!(buyer.storeName && buyer.storeName.trim()) },
          { key: 'owner', value: !!(buyer.owner && buyer.owner.trim()) },
          { key: 'address', value: !!(buyer.address && buyer.address.trim()) },
          { key: 'businessType', value: !!(buyer.businessType && buyer.businessType.trim()) },
          // Email is optional on the buyer form — do not count it against completion.
          { key: 'phone', value: !!(buyer.phone && buyer.phone.trim()) }
        ];
        
        // Check logistics fields
        const logisticsFields: { key: ProfileFieldKey; value: boolean }[] = [];
        try {
          if (buyer.logistics) {
            const logistics = JSON.parse(buyer.logistics);
            
            // Calculate if there's a valid last order date from order details
            let hasValidLastOrderDate = false;
            if (orderDetails && orderDetails.length > 0) {
              const validDates = orderDetails
                .map((order: OrderDetail) => order.lastOrderDate)
                .filter((date: string) => date && String(date).trim());
              hasValidLastOrderDate = validDates.length > 0;
            }
            
            logisticsFields.push(
              { key: 'preferredDays', value: !!logistics?.preferredDays?.trim() },
              { key: 'lastOrderDate', value: hasValidLastOrderDate },
              { key: 'shipmentSuccess', value: !!logistics?.shipmentSuccess?.trim() }
            );
          } else {
            // Calculate if there's a valid last order date from order details
            let hasValidLastOrderDate = false;
            if (orderDetails && orderDetails.length > 0) {
              const validDates = orderDetails
                .map((order: OrderDetail) => order.lastOrderDate)
                .filter((date: string) => date && String(date).trim());
              hasValidLastOrderDate = validDates.length > 0;
            }
            
            logisticsFields.push(
              { key: 'preferredDays', value: false },
              { key: 'lastOrderDate', value: hasValidLastOrderDate },
              { key: 'shipmentSuccess', value: false }
            );
          }
        } catch {
          // Calculate if there's a valid last order date from order details
          let hasValidLastOrderDate = false;
          if (orderDetails && orderDetails.length > 0) {
            const validDates = orderDetails
              .map((order: OrderDetail) => order.lastOrderDate)
              .filter((date: string) => date && String(date).trim());
            hasValidLastOrderDate = validDates.length > 0;
          }
          
          logisticsFields.push(
            { key: 'preferredDays', value: false },
            { key: 'lastOrderDate', value: hasValidLastOrderDate },
            { key: 'shipmentSuccess', value: false }
          );
        }
        
        // Check order details - must have actual order items with content
        const orderFields: { key: ProfileFieldKey; value: boolean }[] = [];
        try {
          if (buyer.orderDetails) {
            const orderDetails = JSON.parse(buyer.orderDetails);
            if (!Array.isArray(orderDetails) || orderDetails.length === 0) {
              orderFields.push({ key: 'orderDetails', value: false });
            } else {
              // Check if orders have meaningful content
              const hasValidOrders = orderDetails.some((order: OrderDetail) => 
                order.product && String(order.product).trim() &&
                order.totalOrders && String(order.totalOrders).trim() &&
                order.totalSpend && String(order.totalSpend).trim()
              );
              orderFields.push({ key: 'orderDetails', value: hasValidOrders });
            }
          } else {
            orderFields.push({ key: 'orderDetails', value: false });
          }
        } catch {
          orderFields.push({ key: 'orderDetails', value: false });
        }
        
        const allFields = [...basicFields, ...logisticsFields, ...orderFields];
        const completedFields = allFields.filter(field => field.value).length;
        const totalFields = allFields.length;
        const completionPercentage = Math.round((completedFields / totalFields) * 100);
        const missingFields = allFields.filter(field => !field.value);
        
        return (
          <div className="mb-4 p-4 bg-gradient-to-r from-blue-50 to-amber-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-800">{tBuyersProfile('profileCompletion')}</h3>
              <span className={`text-sm font-bold ${completionPercentage === 100 ? 'text-green-600' : 'text-amber-700'}`}>
                {completionPercentage}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
              <div 
                className={`h-2 rounded-full transition-all duration-300 ${
                  completionPercentage === 100 ? 'bg-green-500' : 'bg-amber-500'
                }`}
                style={{ width: `${completionPercentage}%` }}
              ></div>
            </div>
            <div className="text-xs text-gray-600">
              {tBuyersProfile('fieldsCompleted', { completed: completedFields, total: totalFields })}
              {missingFields.length > 0 && (
                <span className="ml-2 text-amber-700">
                  • {tBuyersProfile('missingFields', {
                    fields: missingFields.map(field => getFieldLabel(field.key)).join(', '),
                  })}
                </span>
              )}
            </div>
          </div>
        );
      })()}
      
      {/* Compact identity + logistics strip */}
      <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
        <div className="flex min-w-0 flex-col gap-4 @3xl/main:flex-row @3xl/main:items-stretch">
          <div className="flex min-w-0 flex-1 gap-3">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border-2 border-gray-200 bg-gray-100 flex items-center justify-center">
              {buyer.avatar ? (
                <img src={buyer.avatar} alt={buyer.owner || buyer.storeName || ''} className="h-full w-full object-cover" />
              ) : (
                <User className="h-7 w-7 text-gray-400" />
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex min-w-0 flex-col gap-2 @2xl/main:flex-row @2xl/main:items-start @2xl/main:justify-between">
                <div className="min-w-0 flex-1">
                  <h3
                    className="text-base font-bold leading-snug text-black line-clamp-2 @2xl/main:text-lg"
                    title={buyer.storeName?.trim() || undefined}
                  >
                    {buyer.storeName?.trim() ? (
                      buyer.storeName
                    ) : (
                      <span className="text-red-600">{tShared('missing.storeName')}</span>
                    )}
                  </h3>
                  <p
                    className="mt-0.5 truncate text-sm text-gray-600"
                    title={buyer.owner?.trim() || undefined}
                  >
                    {buyer.owner?.trim() ? (
                      buyer.owner
                    ) : (
                      <span className="font-medium text-red-600">{tShared('missing.ownerName')}</span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {buyer.status === 'Active' && (
                    <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-600">
                      {translateStatus('Active')}
                    </span>
                  )}
                  {buyer.status === 'Prospect' && (
                    <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-600">
                      {translateStatus('Prospect')}
                    </span>
                  )}
                  {buyer.status === 'Inactive' && (
                    <span className="inline-block rounded-full bg-gray-200 px-2 py-0.5 text-xs font-bold text-gray-500">
                      {translateStatus('Inactive')}
                    </span>
                  )}
                  {buyer.status === 'Blocked' && (
                    <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-500">
                      {translateStatus('Blocked')}
                    </span>
                  )}
                  {buyer.status === 'Prospect' && (
                    <Link
                      href={`/clients/buyers/buyer-matching?buyerId=${encodeURIComponent(buyer.buyerId)}`}
                      className="text-xs font-medium text-[#0a61d7] hover:underline"
                    >
                      {tBuyersProfile('matchWithOrder')}
                    </Link>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                {buyer.businessType?.trim() ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5 font-medium text-gray-700">
                    <Tag className="h-3 w-3" />
                    {buyer.businessType}
                  </span>
                ) : (
                  <span className="font-medium text-red-600">{tShared('missing.businessType')}</span>
                )}
                <span className="font-medium text-gray-500">
                  {tShared('mobileLabels.id')} {buyer.buyerId}
                </span>
                <span className="inline-flex min-w-0 items-center gap-1">
                  <Phone className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {buyer.phone?.trim() ? (
                      buyer.phone
                    ) : (
                      <span className="font-medium text-red-600">{tShared('missing.phone')}</span>
                    )}
                  </span>
                </span>
                {buyer.email?.trim() ? (
                  <span className="inline-flex min-w-0 max-w-full items-center gap-1">
                    <Mail className="h-3 w-3 shrink-0" />
                    <span className="truncate" title={buyer.email}>
                      {buyer.email}
                    </span>
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3 shrink-0" />
                  {formatDate(buyer.createdAt)}
                </span>
              </div>

              <div className="flex min-w-0 items-start gap-1.5 text-xs text-gray-500">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  {hasAddress ? (
                    <>
                      <p className="line-clamp-2 font-medium text-black" title={addressText}>
                        {addressText}
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowAddressMap(true)}
                        className="mt-0.5 text-xs font-semibold text-[#0a61d7] hover:underline"
                      >
                        {tBuyersProfile('viewInMaps')}
                      </button>
                    </>
                  ) : (
                    <span className="font-medium text-red-600">{tShared('missing.address')}</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex w-full shrink-0 flex-col justify-center gap-2 border-t border-gray-100 pt-3 @3xl/main:w-52 @3xl/main:border-l @3xl/main:border-t-0 @3xl/main:pl-4 @3xl/main:pt-0">
            <div className="text-xs font-semibold text-black">{tBuyersProfile('logisticsNotes')}</div>
            <div className="flex items-start gap-1.5 text-xs">
              <Truck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
              <div className="min-w-0">
                <div className="text-gray-500">{tBuyersProfile('preferredDays')}</div>
                <div className="truncate font-medium text-black" title={logistics?.preferredDays || undefined}>
                  {logistics?.preferredDays?.trim() ? (
                    logistics.preferredDays
                  ) : (
                    <span className="font-normal text-gray-400">—</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-1.5 text-xs">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
              <div className="min-w-0">
                <div className="text-gray-500">{tBuyersProfile('lastOrderDate')}</div>
                <div className="font-medium text-black">
                  {(() => {
                    if (orderDetails && orderDetails.length > 0) {
                      const validDates = orderDetails
                        .map((order: OrderDetail) => order.lastOrderDate)
                        .filter((date: string) => date && String(date).trim())
                        .map((date: string) => new Date(date))
                        .filter((date: Date) => !isNaN(date.getTime()));
                      if (validDates.length > 0) {
                        const mostRecentDate = new Date(Math.max(...validDates.map((d: Date) => d.getTime())));
                        return mostRecentDate.toISOString().split('T')[0];
                      }
                    }
                    return <span className="font-normal text-gray-400">—</span>;
                  })()}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-1.5 text-xs">
              <BarChart2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
              <div className="min-w-0">
                <div className="text-gray-500">{tBuyersProfile('shipmentSuccess')}</div>
                <div className="font-medium text-black">
                  {logistics?.shipmentSuccess?.trim() ? (
                    logistics.shipmentSuccess
                  ) : (
                    <span className="font-normal text-gray-400">—</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Business description (from notes) — between profile row and orders */}
      <div className="bg-white rounded-lg border border-[#e6e6e6] p-4 relative">
        <div className="mb-3 font-semibold text-md text-black">{tBuyersProfile('businessDescription')}</div>
        {notes.length === 0 ? (
          <p className="text-sm text-gray-500">{tBuyersProfile('noBusinessDescription')}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {notes
              .filter((note) => !/^Region:\s*/i.test(note.trim()))
              .map((note, i) => (
                <p key={`desc-${i}`} className="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">
                  {note}
                </p>
              ))}
            {notes.some((note) => /^Region:\s*/i.test(note.trim())) ? (
              <div className="flex flex-wrap gap-1.5">
                {notes
                  .filter((note) => /^Region:\s*/i.test(note.trim()))
                  .map((note, i) => (
                    <span
                      key={`region-${i}`}
                      className="inline-block rounded-full bg-gray-200 px-2 py-1 text-xs text-gray-600"
                    >
                      {note}
                    </span>
                  ))}
              </div>
            ) : null}
          </div>
        )}
      </div>
      {/* Second Row: Order/Product Details */}
      <div className="bg-white rounded-lg border border-[#e6e6e6] p-4 relative">
        <div className="flex items-center justify-between mb-4">
          <div className="font-semibold text-md text-black">{tBuyersProfile('orderSection')}</div>
          <div className="flex gap-2">
            <button 
              className="flex items-center gap-1 px-4 py-2 rounded-lg bg-white border border-[#e6e6e6] text-black font-medium hover:bg-gray-100 transition text-sm disabled:opacity-50" 
              onClick={() => setShowImportOrders(true)}
              disabled={isUpdating}
            >
              {isUpdating ? (
                <div className="w-4 h-4 border-2 border-[#0a61d7] border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {isUpdating ? tBuyersProfile('importing') : tBuyersProfile('importOrders')}
            </button>
            <button className="flex items-center gap-1 px-4 py-2 rounded-lg bg-white border border-[#e6e6e6] text-black font-medium hover:bg-gray-100 transition text-sm" onClick={handleExportOrders}>
              <Download className="w-4 h-4" /> {tBuyersProfile('exportOrders')}
            </button>
          </div>
        </div>
        {/* Success and Error Messages */}
        {updateSuccess && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            <span className="text-green-700 text-sm">{updateSuccess}</span>
          </div>
        )}
        
        {updateError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <span className="text-red-700 text-sm">{updateError}</span>
          </div>
        )}
        
        {showImportOrders && (
          <ImportOrdersModal
            open={showImportOrders}
            onClose={() => setShowImportOrders(false)}
            onImport={async (newOrderDetails) => {
              try {
                setIsUpdating(true);
                setUpdateError('');
                setUpdateSuccess('');
                
                // Merge new orders with existing ones instead of replacing
                const mergedOrderDetails = [...orderDetails, ...newOrderDetails];
                
                // Update the buyer with merged order details
                const UPDATE_BUYER_MUTATION = `
                  mutation UpdateBuyer(
                    $userId: Int!
                    $id: String
                    $buyerId: String
                    $orderDetails: String
                  ) {
                    updateBuyer(
                      userId: $userId
                      id: $id
                      buyerId: $buyerId
                      orderDetails: $orderDetails
                    ) {
                      id
                      buyerId
                      orderDetails
                    }
                  }
                `;
                
                await fetchGraphQL(UPDATE_BUYER_MUTATION, {
                  userId: buyer.userId,
                  buyerId: buyer.buyerId,
                    orderDetails: JSON.stringify(mergedOrderDetails),
                });
                
                // Close modal and show success message
                setShowImportOrders(false);
                setUpdateSuccess(tBuyersProfile('importSuccess', { count: newOrderDetails.length }));
                
                // Refresh the page to show updated data
                setTimeout(() => {
                  window.location.reload();
                }, 1500);
              } catch (error) {
                setUpdateError(error instanceof Error ? error.message : tBuyersProfile('importFailed'));
              } finally {
                setIsUpdating(false);
              }
            }}
          />
        )}
        <div className="flex flex-wrap gap-4 mb-2">
          <div className="text-xs text-gray-600 bg-gray-100 rounded px-3 py-1">{tBuyersProfile('totalOrdersLabel')} <span className="font-bold text-black">{totalOrders}</span></div>
          <div className="text-xs text-gray-600 bg-gray-100 rounded px-3 py-1">{tBuyersProfile('totalSpendLabel')} <span className="font-bold text-[#0a61d7]">{formatCurrency(totalSpend, userCurrency)}</span></div>
          <div className="text-xs text-gray-600 bg-gray-100 rounded px-3 py-1">{tBuyersProfile('outstandingLabel')} <span className="font-bold text-[#f65911]">{formatCurrency(totalOutstanding, userCurrency)}</span></div>
        </div>
        {/* Above Order & Product Details table */}
        <div className="min-w-0 overflow-x-auto rounded-lg">
          <table className="min-w-full text-xs font-medium text-left">
            <thead>
              <tr className="text-gray-500 bg-gray-100 whitespace-nowrap">
                <th className="py-2 px-4 font-medium uppercase">{tBuyersModal('colNo')}</th>
                <th className="py-2 px-4 font-medium uppercase">{tBuyersProfile('productName')}</th>
                <th className="py-2 px-4 font-medium uppercase">{tBuyersModal('colTotalOrders')}</th>
                <th className="py-2 px-4 font-medium uppercase">{tShared('columns.totalSpend')}</th>
                <th className="py-2 px-4 font-medium uppercase">{tBuyersModal('colLastOrderDate')}</th>
                <th className="py-2 px-4 font-medium uppercase">{tShared('columns.outstanding')}</th>
              </tr>
            </thead>
            <tbody>
              {pagedOrderDetails.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 px-4 text-center text-sm text-gray-500">
                    {tBuyersProfile('noOrders')}
                  </td>
                </tr>
              ) : (
                pagedOrderDetails.map((order: OrderDetail, idx: number) => (
                <tr key={idx + (orderPage - 1) * orderRowsPerPage} className="border-b last:border-b-0">
                  <td className="py-4 px-4 font-medium text-black">{(orderPage - 1) * orderRowsPerPage + idx + 1}</td>
                  <td className="py-4 px-4 text-black">
                    <div className="text-xsfont-medium text-black">
                      {dedupeProductNames(order.product)}
                    </div>
                  </td>
                  <td className="py-4 px-4 text-black">
                    {order.totalOrders}
                  </td>
                  <td className="py-4 px-4 text-[#0a61d7] font-semibold">
                    {formatCurrency(parseNumberByCurrency(String(order.totalSpend), userCurrency), userCurrency)}
                  </td>
                  <td className="py-4 px-4 text-black">{order.lastOrderDate}</td>
                  <td className="py-4 px-4 text-[#f65911] font-semibold">
                    {formatCurrency(parseNumberByCurrency(String(order.outstanding), userCurrency), userCurrency)}
                  </td>
                </tr>
                ))
              )}
            </tbody>
          </table>
          {/* Pagination Info and Controls */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mt-4 gap-2">
            <div className="text-xs text-gray-500">
              {tShared('pagination.showing', {
                from: (orderPage - 1) * orderRowsPerPage + (totalOrderRows === 0 ? 0 : 1),
                to: Math.min(orderPage * orderRowsPerPage, totalOrderRows),
                total: totalOrderRows,
              })}
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50"
                onClick={() => setOrderPage(p => Math.max(1, p - 1))}
                disabled={orderPage === 1}
                aria-label={tShared('previousPage')}
              >
                <ChevronLeft className="w-4 h-4 text-gray-500" />
              </button>
              {Array.from({ length: totalOrderPages }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  className={`px-3 py-2 rounded-lg font-semibold text-sm transition ${
                    p === orderPage ? 'bg-[#0a61d7] text-white' : 'bg-white text-[#0a61d7] hover:bg-[#f7faff]'
                  }`}
                  onClick={() => setOrderPage(p)}
                >
                  {p}
                </button>
              ))}
              <button
                className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50"
                onClick={() => setOrderPage(p => Math.min(totalOrderPages, p + 1))}
                disabled={orderPage === totalOrderPages}
                aria-label={tShared('nextPage')}
              >
                <ChevronRight className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          </div>
        </div>
      </div>
      {/* Active rates / Offers — match Order & Product Details card/table styling */}
      <div className="bg-white rounded-lg border border-[#e6e6e6] p-4 relative">
        <div className="flex items-center justify-between mb-4">
          <div className="font-semibold text-md text-black">{tBuyersProfile('offersSection')}</div>
          <button
            type="button"
            className="flex items-center gap-1 px-4 py-2 rounded-lg bg-[#0a61d7] text-white font-medium hover:bg-[#084fb3] transition text-sm"
            onClick={() => router.push(`/offers/new?buyerId=${encodeURIComponent(buyer.buyerId)}`)}
          >
            <Plus className="w-4 h-4" />
            {tBuyersProfile('addRate')}
          </button>
        </div>
        {offersLoading ? (
          <div className="text-sm text-gray-500 py-6 text-center">{tBuyersProfile('offersLoading')}</div>
        ) : (
          <div className="min-w-0 overflow-x-auto rounded-lg">
            <table className="min-w-full text-xs font-medium text-left">
              <thead>
                <tr className="text-gray-500 bg-gray-100 whitespace-nowrap">
                  <th className="py-2 px-4 font-medium uppercase">{tBuyersProfile('offerTarget')}</th>
                  <th className="py-2 px-4 font-medium uppercase">{tBuyersProfile('offerDiscount')}</th>
                  <th className="py-2 px-4 font-medium uppercase">{tBuyersProfile('offerDates')}</th>
                  <th className="py-2 px-4 font-medium uppercase">{tBuyersProfile('offerStatus')}</th>
                  <th className="py-2 px-4 font-medium uppercase text-right">{tBuyersProfile('offerActions')}</th>
                </tr>
              </thead>
              <tbody>
                {buyerOffers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 px-4 text-center text-sm text-gray-500">
                      {tBuyersProfile('noOffers')}
                    </td>
                  </tr>
                ) : (
                  buyerOffers.map((offer) => (
                    <tr key={offer.id} className="border-b last:border-b-0">
                      <td className="py-4 px-4 text-black">
                        {offer.productName
                          ? offer.variantName
                            ? `${offer.productName} · ${offer.variantName}`
                            : `${offer.productName} (${tOffersTable('allVariants')})`
                          : offer.categoryLabel || offer.categoryId || '—'}
                      </td>
                      <td className="py-4 px-4 text-black">
                        {formatDiscount(offer, userCurrency)}
                      </td>
                      <td className="py-4 px-4 text-black">
                        {offer.endDate
                          ? `${formatDate(offer.startDate)} → ${formatDate(offer.endDate)}`
                          : tOffersTable('unlimited')}
                      </td>
                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex px-2 py-1 rounded-full text-xs font-bold ${
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
                      <td className="py-4 px-4 text-right">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-[#e6e6e6] text-black font-medium hover:bg-gray-100 transition text-xs"
                          onClick={() =>
                            router.push(`/offers/details?id=${encodeURIComponent(offer.id)}`)
                          }
                          title={tBuyersProfile('editRate')}
                        >
                          <Edit className="w-3.5 h-3.5" />
                          {tBuyersProfile('editRate')}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {/* Third Row: Analytics */}
      <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
        <div className="font-semibold text-black mb-2">{tBuyersProfile('analytics')}</div>
        
        {orderDetails.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 py-12 text-center text-sm text-gray-500">
            {tBuyersProfile('noAnalytics')}
          </div>
        ) : (
        <>
        {/* Analytics Cards Row */}
        <div className="mb-4 grid grid-cols-1 gap-4 @4xl/main:grid-cols-2">
          
          {/* Monthly Orders Analytics */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-sm font-semibold text-gray-700 mb-2">{tBuyersProfile('monthlyOrdersAnalytics')}</div>
            <div className="text-xs text-gray-600">
              <div>{tBuyersProfile('totalMonthlyOrders')} <span className="font-medium">{totalOrders}</span></div>
              <div className="border-b border-gray-300 pb-2">{tBuyersProfile('totalMonthlyRecords')} <span className="font-medium">{(() => {
                // Extract unique months from order dates
                const uniqueMonths = new Set();
                orderDetails.forEach((order: OrderDetail) => {
                  if (order.lastOrderDate) {
                    const monthKey = order.lastOrderDate.substring(0, 7); // Get YYYY-MM
                    uniqueMonths.add(monthKey);
                  }
                });
                return uniqueMonths.size;
              })()}</span></div>
              <div className="pt-2">{tBuyersProfile('avgMonthlyOrders')} <span className="font-semibold text-blue-500">{(() => {
                // Extract unique months from order dates
                const uniqueMonths = new Set();
                orderDetails.forEach((order: OrderDetail) => {
                  if (order.lastOrderDate) {
                    const monthKey = order.lastOrderDate.substring(0, 7); // Get YYYY-MM
                    uniqueMonths.add(monthKey);
                  }
                });
                const monthCount = uniqueMonths.size;
                return monthCount > 0 ? Math.round(totalOrders / monthCount) : 0;
              })()}</span></div>
            </div>
          </div>

          
          {/* Monthly Spending Analytics */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-sm font-semibold text-gray-700 mb-2">{tBuyersProfile('monthlySpendingAnalytics')}</div>
            <div className="text-xs text-gray-600">
              <div>{tBuyersProfile('totalMonthlySpending')} <span className="font-medium">{formatCurrency(totalSpend, userCurrency)}</span></div>
              <div className="border-b border-gray-300 pb-2">{tBuyersProfile('totalMonthlyRecords')} <span className="font-medium">{(() => {
                // Extract unique months from order dates
                const uniqueMonths = new Set();
                orderDetails.forEach((order: OrderDetail) => {
                  if (order.lastOrderDate) {
                    const monthKey = order.lastOrderDate.substring(0, 7); // Get YYYY-MM
                    uniqueMonths.add(monthKey);
                  }
                });
                return uniqueMonths.size;
              })()}</span></div>
              <div className="pt-2">{tBuyersProfile('avgMonthlySpending')} <span className="font-semibold text-green-500">{currency}{(() => {
                // Extract unique months from order dates
                const uniqueMonths = new Set();
                orderDetails.forEach((order: OrderDetail) => {
                  if (order.lastOrderDate) {
                    const monthKey = order.lastOrderDate.substring(0, 7); // Get YYYY-MM
                    uniqueMonths.add(monthKey);
                  }
                });
                const monthCount = uniqueMonths.size;
                return monthCount > 0 ? formatNumber(Math.round(totalSpend / monthCount)) : 0;
              })()}</span></div>
            </div>
          </div>
        </div>
        
        <p className="text-xs text-gray-500 italic mb-2">{tBuyersProfile('analyticsNote')}</p>
        <div className="flex flex-col gap-6 @4xl/main:flex-row">
          <div className="min-w-0 flex-1 rounded-lg border border-[#e6e6e6] bg-white p-4">
            <div className="text-lg font-semibold text-gray-900 mb-6">{tBuyersProfile('chartOrdersPerMonth')}</div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analyticsData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <defs>
                  <linearGradient id="ordersGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0a61d7" stopOpacity={0.8}/>
                    <stop offset="100%" stopColor="#0a61d7" stopOpacity={0.6}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="#000000" strokeOpacity={0.2} horizontal={true} vertical={false} />
                <XAxis 
                  dataKey="month" 
                  stroke="#64748B" 
                  fontSize={12}
                  fontWeight={500}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis 
                  stroke="#64748B" 
                  fontSize={12}
                  fontWeight={500}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip 
                  formatter={(value: number) => [tBuyersProfile('tooltipOrdersCount', { count: value }), tBuyersProfile('tooltipOrders')]}
                  labelStyle={{ 
                    color: '#1E293B', 
                    fontWeight: 600,
                    fontSize: '14px'
                  }}
                  contentStyle={{ 
                    backgroundColor: 'white', 
                    border: 'none',
                    borderRadius: '12px',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                    padding: '16px'
                  }}
                  cursor={{ fill: '#F1F5F9', fillOpacity: 0.3 }}
                  itemStyle={{ color: '#0a61d7' }}
                />
                <Bar 
                  dataKey="orders" 
                  fill="url(#ordersGradient)" 
                  radius={[6, 6, 0, 0]}
                  maxBarSize={50}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="min-w-0 flex-1 rounded-lg border border-[#e6e6e6] bg-white p-4">
            <div className="text-lg font-semibold text-gray-900 mb-6">{tBuyersProfile('chartSpendingPerMonth')}</div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={analyticsData} margin={{ top: 20, right: 50, left: 50, bottom: 20 }}>
                <defs>
                  <linearGradient id="spendingGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f65911" stopOpacity={0.4}/>
                    <stop offset="50%" stopColor="#f65911" stopOpacity={0.2}/>
                    <stop offset="100%" stopColor="#f65911" stopOpacity={0.05}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="#000000" strokeOpacity={0.2} horizontal={true} vertical={false} />
                <XAxis 
                  dataKey="month" 
                  stroke="#64748B" 
                  fontSize={12}
                  fontWeight={500}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis 
                  stroke="#64748B" 
                  fontSize={12}
                  fontWeight={500}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => formatCurrency(value, userCurrency)}
                />
                <Tooltip 
                  formatter={(value: number) => [formatCurrency(Number(value), userCurrency), tBuyersProfile('tooltipSpending')]}
                  labelStyle={{ 
                    color: '#1E293B', 
                    fontWeight: 600,
                    fontSize: '14px'
                  }}
                  contentStyle={{ 
                    backgroundColor: 'white', 
                    border: 'none',
                    borderRadius: '12px',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                    padding: '16px'
                  }}
                  cursor={{ fill: '#F1F5F9', fillOpacity: 0.3 }}
                  itemStyle={{ color: '#f65911' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="spending" 
                  stroke="#f65911" 
                  strokeWidth={3}
                  dot={{ 
                    fill: '#f65911', 
                    strokeWidth: 2, 
                    r: 4,
                    stroke: 'white',
                    filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))'
                  }}
                  activeDot={{ 
                    r: 6, 
                    stroke: '#f65911', 
                    strokeWidth: 3,
                    fill: 'white',
                    filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.15))'
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        </>
        )}
      </div>
      <MapFullscreenModal
        open={showAddressMap}
        onClose={() => setShowAddressMap(false)}
        title={tBuyersProfile('addressMapTitle')}
      >
        <div className="flex h-full min-h-0 flex-col gap-3">
          <p className="shrink-0 text-sm text-gray-700 whitespace-pre-wrap">{addressText}</p>
          {addressGeocode?.coordinates ? (
            <div className="min-h-0 flex-1">
              <MapComponent
                key={`buyer-address-map-${buyer.buyerId}`}
                accessToken={mapboxToken}
                markers={[
                  {
                    id: buyer.buyerId,
                    coordinates: addressGeocode.coordinates,
                    label: buyer.storeName || buyer.owner || addressText,
                    color: '#0a61d7',
                  },
                ]}
                center={addressGeocode.coordinates}
                zoom={15}
                height="100%"
                className="h-full min-h-0 rounded-none border-0"
                showControls={true}
              />
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              {isGeocodingAddress
                ? tBuyersProfile('addressMapLoading')
                : tBuyersProfile('addressMapUnavailable')}
            </p>
          )}
        </div>
      </MapFullscreenModal>
    </div>
  );
}

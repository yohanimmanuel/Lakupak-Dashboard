'use client';
import React from "react";
import { Phone, MapPin, Store, Tag, Truck, Info, FileText, Calendar, BarChart2, ArrowLeft, Edit, Copy, Mail, ChevronLeft, ChevronRight, User } from "lucide-react";
import Link from "next/link";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts';
import { useEffect, useMemo, useState } from 'react';
import { fetchGraphQL } from '@/lib/graphqlClient';
import SupplyMoveModal, {
  type SupplyMoveCandidateRow,
  type ManualSupplyRecord,
} from '@/components/clientmanagement/SupplyMoveModal';
import { Supplier, SupplyDetail } from '@/types/client';
import { formatDate, formatNumber } from '@/utils/dateUtils';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';
import { parseNumberByCurrency } from '@/config/currencyConfig';
import { useUserStore } from '@/store/userStore';
import { useClientsTranslations } from '@/hooks/useClientsTranslations';
import { TABLE_PAGE_SIZE, getVisiblePageNumbers } from '@/utils/tablePagination';
import {
  isSupplyHistoryRow,
  mergeDuplicateSummaryRows,
  partitionSupplies,
} from '@/lib/suppliers/supplyRecords';

function getSupplierAnalytics(suppliesStr: string, language?: string | null) {
  const monthLocale = language === 'id' ? 'id-ID' : 'en-US';
  if (!suppliesStr) return [];
  
  try {
    const supplies = JSON.parse(suppliesStr);
    if (!Array.isArray(supplies)) return [];
    
    // Group by month using YYYY-MM format for proper sorting
    const map: { [monthKey: string]: { supplied: number; value: number; date: Date } } = {};
    supplies.forEach(function(supply: SupplyDetail) {
      // Monthly charts are driven by dated history events only
      if (!isSupplyHistoryRow(supply) || !supply.lastDelivery) return;
      const date = new Date(supply.lastDelivery);
      if (isNaN(date.getTime())) return; // Skip invalid dates
      
      // Use YYYY-MM format for proper chronological sorting
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const totalSupplied = Number(supply.totalSupplied) || 0;
      // Remove non-numeric from totalValue (e.g. 'Rp 60,000,000')
      const value = Number((supply.totalValue || '').toString().replace(/[^\d]/g, ''));
      
      if (!map[monthKey]) {
        map[monthKey] = { supplied: 0, value: 0, date: new Date(date.getFullYear(), date.getMonth(), 1) };
      }
      map[monthKey].supplied += totalSupplied;
      map[monthKey].value += value;
    });
    
    // Sort months chronologically and format for display
    const sortedEntries = Object.entries(map).sort((a, b) => {
      return a[1].date.getTime() - b[1].date.getTime();
    });
    
    return sortedEntries.map(([monthKey, data]) => ({
      month: data.date.toLocaleDateString(monthLocale, { month: 'long', year: 'numeric' }),
      supplied: data.supplied,
      value: data.value,
    }));
  } catch (error) {
    return [];
  }
}

interface SupplierProfileProps {
  supplier: Supplier;
  onClose?: () => void;
  onUpdate?: () => void;
}

export default function SupplierProfile({ supplier, onClose, onUpdate }: SupplierProfileProps) {
  const user = useUserStore(state => state.user);
  const { tSuppliersProfile, tSuppliersModal, tShared, translateStatus, tCommon } = useClientsTranslations();
  
  // Get user currency for display
  const userCurrency = user?.currency || getDefaultCurrency();
  const [suppliesTab, setSuppliesTab] = useState<'summary' | 'history'>('history');
  const [moveCandidates, setMoveCandidates] = useState<SupplyMoveCandidateRow[]>([]);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [movingSupplies, setMovingSupplies] = useState(false);
  const [transferMode, setTransferMode] = useState<'automatic' | 'manual'>('automatic');
  const [manualRecords, setManualRecords] = useState<ManualSupplyRecord[]>([]);
  const [loadingTransfers, setLoadingTransfers] = useState(false);
  const [moveMessage, setMoveMessage] = useState('');
  
  // SupplierProfile - Raw supplier data
  
  // Parse supplies and notes from strings to arrays
  const suppliesRaw = supplier.supplies;
  const supplies = suppliesRaw ? (() => {
    try {
      const parsed = JSON.parse(suppliesRaw);
      return parsed;
    } catch (error) {
      return [];
    }
  })() : [];
  
  const notes = supplier.notes ? (() => {
    try {
      const parsed = JSON.parse(supplier.notes);
      return parsed;
    } catch (error) {
      return [];
    }
  })() : [];
  
  const logistics = supplier.logistics ? (() => {
    try {
      const parsed = JSON.parse(supplier.logistics);
      return parsed;
    } catch (error) {
      return {};
    }
  })() : {};
  
  // SupplierProfile - Final parsed data
  
  const handleCopy = () => {
    let text = '';
    text += `ID: ${supplier.id}\n`;
    text += `Supplier Name: ${supplier.name}\n`;
    text += `Contact: ${supplier.contact}\n`;
    text += `Email: ${supplier.email}\n`;
    text += `Phone: ${supplier.phone}\n`;
    text += `Business Type: ${supplier.businessType}\n`;
    text += `Address: ${supplier.address}\n`;
    text += `Status: ${supplier.status}\n`;
    text += `Created At: ${supplier.createdAt}\n`;
    text += `Preferred Delivery Days: ${logistics?.preferredDays || ''}\n`;
    text += `Last Delivery: ${logistics?.lastDelivery || ''}\n`;
    text += `Delivery Success: ${logistics?.deliverySuccess || ''}\n`;
    text += `Notes: ${notes.join(', ')}\n`;
    text += `\nSupplies & Product Data:\n`;
    for (const row of supplies) {
      text += `- Supplies No: ${row.suppliesno}, SKU: ${row.sku}, Product: ${row.product}, Total Supplied: ${row.totalSupplied}, Total Value: ${row.totalValue}, Last Delivery: ${row.lastDelivery}, Status: ${row.status}\n`;
    }
    navigator.clipboard.writeText(text);
  };
  
  const analyticsData = getSupplierAnalytics(suppliesRaw || '', user?.language);
  const { history: historySupplies, summary: summarySupplies } = useMemo(() => {
    const buckets = partitionSupplies(Array.isArray(supplies) ? supplies : []);
    // One total per SKU, even for rows saved before imports matched by SKU.
    return { history: buckets.history, summary: mergeDuplicateSummaryRows(buckets.summary) };
  }, [supplies]);

  useEffect(() => {
    let cancelled = false;
    const userId = user?.id;
    const supplierKey = String(supplier.supplierId || supplier.id || '').trim();
    if (!userId || !supplierKey) {
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
        if (!cancelled) {
          setMoveCandidates(data.supplierSupplyMoveCandidates || []);
        }
      } catch {
        if (!cancelled) setMoveCandidates([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, supplier.supplierId, supplier.id, supplier.supplies]);

  const openManualTransfers = async () => {
    const userId = user?.id;
    const supplierId = String(supplier.supplierId || supplier.id || '').trim();
    if (!userId || !supplierId || loadingTransfers || movingSupplies) return;

    setLoadingTransfers(true);
    setMoveMessage('');
    try {
      const data = await fetchGraphQL<{
        supplierTransferRecords: ManualSupplyRecord[];
      }>(
        `query ManualSupplierTransfers($userId: Int!, $supplierId: String!) {
          supplierTransferRecords(userId: $userId, supplierId: $supplierId) {
            id
            sku
            product
            totalSupplied
            totalValue
            lastDelivery
            productId
            variantName
            targetSupplierName
            recordType
          }
        }`,
        { userId, supplierId },
      );
      setManualRecords(data.supplierTransferRecords ?? []);
      setTransferMode('manual');
      setShowMoveModal(true);
    } catch (err) {
      setMoveMessage(err instanceof Error ? err.message : 'Failed to load supply transfers');
    } finally {
      setLoadingTransfers(false);
    }
  };

  const handleManualSupplyMove = async (recordIds: number[]) => {
    const userId = user?.id;
    const fromSupplierId = String(supplier.supplierId || '').trim();
    if (!userId || !fromSupplierId || !recordIds.length || movingSupplies) return;
    setMovingSupplies(true);
    setMoveMessage('');
    try {
      const data = await fetchGraphQL<{
        moveSelectedSupplyRecords: { success: boolean; movedHistoryCount: number };
      }>(`mutation ManualMove($userId: Int!, $fromSupplierId: String!,
          $recordIds: [Int!]!) {
          moveSelectedSupplyRecords(userId: $userId, fromSupplierId: $fromSupplierId,
            recordIds: $recordIds) {
            success movedHistoryCount
          }
        }`, { userId, fromSupplierId, recordIds });
      if (!data.moveSelectedSupplyRecords.success) throw new Error('Transfer failed');
      setShowMoveModal(false);
      setMoveMessage(`Moved ${data.moveSelectedSupplyRecords.movedHistoryCount} supply record(s).`);
      onUpdate?.();
    } catch (err) {
      setMoveMessage(err instanceof Error ? err.message : 'Transfer failed');
    } finally {
      setMovingSupplies(false);
    }
  };

  const handleConfirmSupplyMove = async (
    variants: Array<{ productId: string; variantName: string }>,
  ) => {
    const userId = user?.id;
    const supplierKey = String(supplier.supplierId || supplier.id || '').trim();
    if (!userId || !supplierKey || variants.length === 0) return;
    setMovingSupplies(true);
    setMoveMessage('');
    try {
      const data = await fetchGraphQL<{
        moveSupplierSupplies: {
          success: boolean;
          movedHistoryCount: number;
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
            message
          }
        }`,
        { userId, fromSupplierId: supplierKey, variants },
      );
      const result = data.moveSupplierSupplies;
      setShowMoveModal(false);
      setMoveMessage(
        tSuppliersProfile('supplyMoveSuccess', { count: result.movedHistoryCount || 0 }),
      );
      onUpdate?.();
    } catch (error) {
      setMoveMessage(
        error instanceof Error ? error.message : tSuppliersProfile('supplyMoveFailed'),
      );
    } finally {
      setMovingSupplies(false);
    }
  };

  // Header totals come from summary rows (match totals + rolled-up history), avoiding double-count.
  const totalSupplied =
    summarySupplies.reduce((sum, s) => sum + (parseInt(s.totalSupplied) || 0), 0) || 0;
  let totalValue = 0;
  let currency = '';
  summarySupplies.forEach((s: SupplyDetail) => {
    const match = (s.totalValue || '').toString().match(/^([^\d]*)/);
    if (match && match[1] && !currency) currency = match[1];
    totalValue += parseInt((s.totalValue || '').toString().replace(/[^\d]/g, '')) || 0;
  });
  
  const [supplyPage, setSupplyPage] = useState(1);
  const [productStockUnits, setProductStockUnits] = useState<Record<string, string>>({});

  useEffect(() => {
    const userId = user?.id;
    if (!userId) {
      setProductStockUnits({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        let page = 1;
        let totalPages = 1;
        const units: Record<string, string> = {};
        do {
          const data = await fetchGraphQL<{
            products: {
              nodes: Array<{ productId: string; stockUnit?: string | null }>;
              pagination: { totalPages?: number };
            };
          }>(
            `query SupplierProfileStockUnits($userId: Int!, $page: Int!, $limit: Int!) {
              products(userId: $userId, page: $page, limit: $limit) {
                nodes { productId stockUnit }
                pagination { totalPages }
              }
            }`,
            { userId, page, limit: 1000 },
          );
          for (const product of data.products?.nodes || []) {
            const key = String(product.productId || '').trim();
            const unit = String(product.stockUnit || '').trim();
            if (key && unit) units[key] = unit;
          }
          totalPages = Math.max(1, data.products?.pagination?.totalPages ?? 1);
          page += 1;
        } while (!cancelled && page <= totalPages);
        if (!cancelled) setProductStockUnits(units);
      } catch {
        if (!cancelled) setProductStockUnits({});
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const getSupplyUnit = (supply: SupplyDetail) =>
    supply.productId ? productStockUnits[supply.productId] || '' : '';
  const getSupplyUnitLabel = (supply: SupplyDetail) => {
    const unit = getSupplyUnit(supply);
    return unit ? ` (${unit})` : '';
  };
  const supplyRowsPerPage = TABLE_PAGE_SIZE;
  const activeSupplyRows = suppliesTab === 'history' ? historySupplies : summarySupplies;
  const totalSupplyRows = activeSupplyRows.length;
  const totalSupplyPages = Math.max(1, Math.ceil(totalSupplyRows / supplyRowsPerPage));
  const pagedSupplies = activeSupplyRows.slice(
    (supplyPage - 1) * supplyRowsPerPage,
    supplyPage * supplyRowsPerPage,
  );

  return (
    <div className="mx-auto flex w-full min-w-0 flex-col gap-4 rounded-lg border border-[#e6e6e6] bg-white p-4">
      {/* Header */}
      <div className="mb-2 flex min-w-0 flex-col gap-3 @5xl/main:flex-row @5xl/main:items-center @5xl/main:justify-between">
        <div className="flex min-w-0 flex-col gap-3 @3xl/main:flex-row @3xl/main:items-center">
          <Link
            href="/clients/suppliers"
            className="flex w-full shrink-0 items-center justify-center gap-2 rounded-lg px-3 py-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800 @3xl/main:w-auto @3xl/main:justify-start"
          >
            <ArrowLeft className="h-4 w-4" />
            {tSuppliersProfile('back')}
          </Link>
          <h2 className="min-w-0 truncate text-2xl font-bold text-black">{tSuppliersProfile('title')}</h2>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-2 @4xl/main:flex-row @4xl/main:flex-wrap @4xl/main:items-center @5xl/main:w-auto">
          <button
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#e6e6e6] bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-gray-100 @4xl/main:w-auto"
            onClick={handleCopy}
          >
            <Copy className="h-4 w-4" /> {tSuppliersProfile('copyData')}
          </button>
          <Link
            href={`/clients/suppliers/edit/${encodeURIComponent(supplier.supplierId)}`}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0a61d7] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#084ba6] @4xl/main:w-auto"
          >
            <Edit className="h-4 w-4" /> {tSuppliersProfile('editDetails')}
          </Link>
        </div>
      </div>
      
      {/* Data Completion Progress */}
      {(() => {
        // Check all profile fields for missing data (excluding notes and pictures)
        const basicFields = [
          { key: 'name', value: supplier.name && supplier.name.trim() },
          { key: 'address', value: supplier.address && supplier.address.trim() },
          { key: 'businessType', value: supplier.businessType && supplier.businessType.trim() },
          { key: 'contact', value: supplier.contact && supplier.contact.trim() },
          { key: 'email', value: supplier.email && supplier.email.trim() },
          { key: 'phone', value: supplier.phone && supplier.phone.trim() }
        ];
        
        // Check logistics fields
        const logisticsFields = [];
        try {
          if (supplier.logistics) {
            const logistics = JSON.parse(supplier.logistics);
            logisticsFields.push(
              { key: 'preferredDays', value: logistics?.preferredDays?.trim() },
              { key: 'lastDelivery', value: logistics?.lastDelivery?.trim() },
              { key: 'deliverySuccess', value: logistics?.deliverySuccess?.trim() }
            );
          } else {
            logisticsFields.push(
              { key: 'preferredDays', value: false },
              { key: 'lastDelivery', value: false },
              { key: 'deliverySuccess', value: false }
            );
          }
        } catch {
          logisticsFields.push(
            { key: 'preferredDays', value: false },
            { key: 'lastDelivery', value: false },
            { key: 'deliverySuccess', value: false }
          );
        }
        
        // Check supplies data - must have actual supply items with content
        const suppliesFields = [];
        try {
          if (supplier.supplies) {
            const supplies = JSON.parse(supplier.supplies);
            if (!Array.isArray(supplies) || supplies.length === 0) {
              suppliesFields.push({ key: 'suppliesData', value: false });
            } else {
              // Check if supplies have meaningful content
              const hasValidSupplies = supplies.some((supply: SupplyDetail) => 
                supply.sku && String(supply.sku).trim() &&
                supply.product && String(supply.product).trim() &&
                supply.totalSupplied && String(supply.totalSupplied).trim() &&
                supply.totalValue && String(supply.totalValue).trim()
              );
              suppliesFields.push({ key: 'suppliesData', value: hasValidSupplies });
            }
          } else {
            suppliesFields.push({ key: 'suppliesData', value: false });
          }
        } catch {
          suppliesFields.push({ key: 'suppliesData', value: false });
        }
        
        const allFields = [...basicFields, ...logisticsFields, ...suppliesFields];
        const completedFields = allFields.filter(field => field.value).length;
        const totalFields = allFields.length;
        const completionPercentage = Math.round((completedFields / totalFields) * 100);
        const missingFields = allFields.filter(field => !field.value);
        
        return (
          <div className="mb-4 p-4 bg-gradient-to-r from-blue-50 to-amber-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-800">{tSuppliersProfile('profileCompletion')}</h3>
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
              {tSuppliersProfile('fieldsCompleted', { completed: completedFields, total: totalFields })}
              {missingFields.length > 0 && (
                <span className="ml-2 text-amber-700">
                  • {tSuppliersProfile('missingFields', {
                    fields: missingFields.map(field => tSuppliersProfile(`fields.${field.key}`)).join(', ')
                  })}
                </span>
              )}
            </div>
          </div>
        );
      })()}
      
      {/* Top Row */}
      <div className="grid grid-cols-1 gap-4 @4xl/main:grid-cols-2">
        {/* General Info */}
        <div className="bg-white rounded-lg border border-[#e6e6e6] p-4 flex flex-col justify-center relative">
          <div className="absolute left-4 top-4 text-md font-bold text-black">{tSuppliersProfile('generalInfo')}</div>
          <div className="flex flex-col gap-3 mt-8">
            <div className="flex items-center gap-2 text-gray-500 text-xs">
              <Store className="w-4 h-5" />
              <span className="font-semibold text-black text-xs">
                {supplier.name && supplier.name.trim() ? supplier.name : <span className="text-red-600 font-bold">{tShared('missing.name')}</span>} | {supplier.supplierId}
              </span>
            </div>
            <div className="flex items-center gap-2 text-gray-500 text-xs">
              <Tag className="w-4 h-4" />
              <span className="font-medium text-black">
                {supplier.businessType && supplier.businessType.trim() ? supplier.businessType : <span className="text-red-600 font-bold">{tShared('missing.businessType')}</span>}
              </span>
            </div>
            <div className="flex items-center gap-2 text-gray-500 text-xs">
              <MapPin className="w-4 h-4" />
              <span className="font-medium text-black">
                {supplier.address && supplier.address.trim() ? supplier.address : <span className="text-red-600 font-bold">{tShared('missing.address')}</span>}
              </span>
            </div>
            <div className="flex items-center gap-2 text-gray-500 text-xs">
              <Mail className="w-4 h-4" />
              <span className="font-medium text-black">
                {supplier.contact && supplier.contact.trim() ? supplier.contact : <span className="text-red-600 font-bold">{tShared('missing.contact')}</span>} | {supplier.email && supplier.email.trim() ? supplier.email : <span className="text-red-600 font-bold">{tShared('missing.email')}</span>}
              </span>
            </div>
            <div className="flex items-center gap-2 text-gray-500 text-xs">
              <Phone className="w-4 h-4" />
              <span className="font-medium text-black">
                {supplier.phone && supplier.phone.trim() ? supplier.phone : <span className="text-red-600 font-bold">{tShared('missing.phone')}</span>}
              </span>
            </div>
            <div className="flex items-center gap-2 text-gray-500 text-xs">
              <Calendar className="w-4 h-4" />
                             <span className="font-medium text-black">{formatDate(supplier.createdAt)}</span>
            </div>
          </div>
        </div>
        {/* Logistics & Notes */}
        <div className="bg-white rounded-lg border border-[#e6e6e6] p-4 flex flex-col gap-2 justify-center relative">
          <div className="absolute left-4 top-4 text-md font-bold text-black">{tSuppliersProfile('logisticsNotes')}</div>
          <div className="flex flex-col gap-2 pt-10">
            <div className="flex items-center gap-2 text-xs">
              <Truck className="w-4 h-4 text-gray-500" />
              <span className="text-gray-500">{tSuppliersProfile('preferredDays')}</span>
              <span className="font-semibold text-black">
                {logistics?.preferredDays && logistics.preferredDays.trim() ? logistics.preferredDays : <span className="text-red-600 font-bold">{tShared('missing.preferredDays')}</span>}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Info className="w-4 h-4 text-gray-500" />
              <span className="text-gray-500">{tSuppliersProfile('lastDelivery')}</span>
              <span className="font-semibold text-black">
                {logistics?.lastDelivery && logistics.lastDelivery.trim() ? logistics.lastDelivery : <span className="text-red-600 font-bold">{tShared('missing.lastDelivery')}</span>}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <BarChart2 className="w-4 h-4 text-gray-500" />
              <span className="text-gray-500">{tSuppliersProfile('deliverySuccess')}</span>
              <span className="font-semibold text-black">
                {logistics?.deliverySuccess && logistics.deliverySuccess.trim() ? logistics.deliverySuccess : <span className="text-red-600 font-bold">{tShared('missing.deliverySuccess')}</span>}
              </span>
            </div>
            <div className="border-t border-gray-200 pt-2 flex items-center gap-2 text-xs mt-2">
              <span className="text-gray-500">{tShared('columns.status')}:</span>
              {supplier.status === 'Active' && (
                <span className="inline-block px-2 py-1 rounded-full font-bold bg-green-100 text-green-500 text-xs">{translateStatus('Active')}</span>
              )}
              {supplier.status === 'Inactive' && (
                <span className="inline-block px-2 py-1 rounded-full font-bold bg-gray-200 text-gray-500 text-xs">{translateStatus('Inactive')}</span>
              )}
              {supplier.status === 'Blocked' && (
                <span className="inline-block px-2 py-1 rounded-full font-bold bg-red-100 text-red-500 text-xs">{translateStatus('Blocked')}</span>
              )}
            </div>
            <div className="text-xs gap-2 mt-2">
              <span className="text-gray-500 mr-2.5">{tSuppliersProfile('notes')}</span>
              {notes.map((note: string, i: number) => (
                <span key={i} className="inline-block bg-gray-200 text-gray-600 px-2 py-1 rounded-full mr-1">{note}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* Second Row: Supplies/Product Data (view-only; edit/import/export on edit page) */}
      <div className="bg-white rounded-lg border border-[#e6e6e6] p-4 relative">
        <div className="flex items-center justify-between mb-4">
          <div className="font-semibold text-md text-black">
            {tSuppliersProfile('suppliesSection')}
          </div>

          <button
            type="button"
            className="rounded-lg border border-[#e6e6e6] px-3 py-1.5 text-xs font-semibold text-black hover:bg-gray-50"
            onClick={() => void openManualTransfers()}
            disabled={movingSupplies || loadingTransfers}
          >
            Manage Supply Transfers
          </button>
        </div>
        {moveMessage ? (
          <div className="mb-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
            {moveMessage}
          </div>
        ) : null}
        {showMoveModal && (
          <SupplyMoveModal
            open={showMoveModal}
            candidates={moveCandidates}
            currency={userCurrency}
            submitting={movingSupplies}
            onCloseAction={() => setShowMoveModal(false)}
            onConfirmAction={handleConfirmSupplyMove}
                mode={transferMode}
                manualRecords={manualRecords}
                manualEnabled={true}
                onManualConfirmAction={handleManualSupplyMove}
          />
        )}
        {/* Summary Statistics */}
        <div className="flex flex-wrap gap-4 mb-4">
          <div className="text-xs text-gray-600 bg-gray-100 rounded px-3 py-1">
            {tSuppliersProfile('totalSuppliedLabel')} <span className="font-bold text-black">{totalSupplied}</span>
          </div>
          <div className="text-xs text-gray-600 bg-gray-100 rounded px-3 py-1">
                            {tSuppliersProfile('totalPurchaseValueLabel')} <span className="font-bold text-[#0a61d7]">{formatCurrency(totalValue, userCurrency)}</span>
          </div>
        </div>
        <div className="mb-4 inline-flex rounded-full border border-[#e6e6e6] bg-gray-50 p-1">
          <button
            type="button"
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              suppliesTab === 'summary'
                ? 'bg-white text-black shadow-sm'
                : 'text-gray-500 hover:text-black'
            }`}
            onClick={() => {
              setSuppliesTab('summary');
              setSupplyPage(1);
            }}
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
            onClick={() => {
              setSuppliesTab('history');
              setSupplyPage(1);
            }}
          >
            {tSuppliersProfile('supplyHistoryTab')}
          </button>
        </div>
        <div className="min-w-0 overflow-x-auto rounded-lg">
          <table className="min-w-full text-xs font-medium text-left">
            <thead>
              <tr className="text-gray-500 bg-gray-100 whitespace-nowrap">
                {suppliesTab === 'history' ? (
                  <>
                    <th className="py-2 px-4 font-medium uppercase">{tSuppliersProfile('lastSuppliedDateCol')}</th>
                    <th className="py-2 px-4 font-medium uppercase">{tSuppliersProfile('skuNumber')}</th>
                    <th className="py-2 px-4 font-medium uppercase">{tSuppliersProfile('receivedCol')}{getSupplyUnitLabel(pagedSupplies[0] || {} as SupplyDetail)}</th>
                    <th className="py-2 px-4 font-medium uppercase">{tSuppliersProfile('purchaseValueCol')}</th>
                  </>
                ) : (
                  <>
                    <th className="py-2 px-4 font-medium uppercase">{tSuppliersModal('colNo')}</th>
                    <th className="py-2 px-4 font-medium uppercase">{tSuppliersProfile('skuProductCol')}</th>
                    <th className="py-2 px-4 font-medium uppercase">{tSuppliersProfile('totalSuppliedCol')}{getSupplyUnitLabel(pagedSupplies[0] || {} as SupplyDetail)}</th>
                    <th className="py-2 px-4 font-medium uppercase">{tSuppliersProfile('totalPurchaseCol')}</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {pagedSupplies.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-10 px-4 text-center text-sm text-gray-500">
                    {tSuppliersProfile('noSupplies')}
                  </td>
                </tr>
              ) : suppliesTab === 'history' ? (
                pagedSupplies.map((supply: SupplyDetail, idx: number) => (
                  <tr
                    key={`hist-${supply.suppliesno || ''}-${idx}-${supplyPage}`}
                    className="border-b last:border-b-0"
                  >
                    <td className="py-4 px-4 text-black">{String(supply.lastDelivery || '—')}</td>
                    <td className="py-4 px-4 font-medium text-black">{String(supply.sku || '—')}</td>
                    <td className="py-4 px-4 text-black">{String(supply.totalSupplied)}{getSupplyUnit(supply) ? ` ${getSupplyUnit(supply)}` : ''}</td>
                    <td className="py-4 px-4 text-[#0a61d7] font-semibold">
                      {formatCurrency(
                        parseNumberByCurrency(String(supply.totalValue), userCurrency),
                        userCurrency,
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                pagedSupplies.map((supply: SupplyDetail, idx: number) => (
                  <tr
                    key={`sum-${supply.suppliesno || idx}-${supplyPage}`}
                    className="border-b last:border-b-0"
                  >
                    <td className="py-4 px-4 font-medium text-black">
                      {(supplyPage - 1) * supplyRowsPerPage + idx + 1}
                    </td>
                    <td className="py-4 px-4 text-black">
                      <div className="font-medium">{String(supply.sku || '—')}</div>
                      <div className="text-gray-500">{String(supply.product || '—')}</div>
                    </td>
                    <td className="py-4 px-4 text-black">{String(supply.totalSupplied)}{getSupplyUnit(supply) ? ` ${getSupplyUnit(supply)}` : ''}</td>
                    <td className="py-4 px-4 text-[#0a61d7] font-semibold">
                      {formatCurrency(
                        parseNumberByCurrency(String(supply.totalValue), userCurrency),
                        userCurrency,
                      )}
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
                from: (supplyPage - 1) * supplyRowsPerPage + (totalSupplyRows === 0 ? 0 : 1),
                to: Math.min(supplyPage * supplyRowsPerPage, totalSupplyRows),
                total: totalSupplyRows,
              })}
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50"
                onClick={() => setSupplyPage(p => Math.max(1, p - 1))}
                disabled={supplyPage === 1}
                aria-label={tShared('previousPage')}
              >
                <ChevronLeft className="w-4 h-4 text-gray-500" />
              </button>
              {getVisiblePageNumbers(supplyPage, totalSupplyPages).map(p => (
                <button
                  key={p}
                  className={`px-3 py-2 rounded-lg font-semibold text-sm transition ${
                    p === supplyPage ? 'bg-[#0a61d7] text-white' : 'bg-white text-[#0a61d7] hover:bg-[#f7faff]'
                  }`}
                  onClick={() => setSupplyPage(p)}
                >
                  {p}
                </button>
              ))}
              <button
                className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50"
                onClick={() => setSupplyPage(p => Math.min(totalSupplyPages, p + 1))}
                disabled={supplyPage === totalSupplyPages}
                aria-label={tShared('nextPage')}
              >
                <ChevronRight className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          </div>
        </div>
      </div>
      {/* Third Row: Analytics */}
      <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
        <div className="font-semibold text-black mb-2">{tSuppliersProfile('analytics')}</div>
        
        {supplies.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 py-12 text-center text-sm text-gray-500">
            {tSuppliersProfile('noAnalytics')}
          </div>
        ) : (
        <>
        {/* Analytics Cards Row */}
        <div className="mb-4 grid grid-cols-1 gap-4 @4xl/main:grid-cols-2">
          {/* Monthly Purchase Analytics */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-sm font-semibold text-gray-700 mb-2">{tSuppliersProfile('monthlyPurchaseAnalytics')}</div>
            <div className="text-xs text-gray-600">
              <div>{tSuppliersProfile('totalMonthlyPurchaseValue')} <span className="font-medium">{formatCurrency(totalValue, userCurrency)}</span></div>
              <div className="border-b border-gray-300 pb-2">{tSuppliersProfile('totalMonthlyRecords')} <span className="font-medium">{(() => {
                // Extract unique months from delivery dates
                const uniqueMonths = new Set();
                historySupplies.forEach((supply: SupplyDetail) => {
                  if (supply.lastDelivery) {
                    const monthKey = supply.lastDelivery.substring(0, 7); // Get YYYY-MM
                    uniqueMonths.add(monthKey);
                  }
                });
                return uniqueMonths.size;
              })()}</span></div>
              <div className="pt-2">{tSuppliersProfile('avgMonthlyPurchase')} <span className="font-semibold text-green-500">{currency}{(() => {
                // Extract unique months from delivery dates
                const uniqueMonths = new Set();
                historySupplies.forEach((supply: SupplyDetail) => {
                  if (supply.lastDelivery) {
                    const monthKey = supply.lastDelivery.substring(0, 7); // Get YYYY-MM
                    uniqueMonths.add(monthKey);
                  }
                });
                const monthCount = uniqueMonths.size;
                return monthCount > 0 ? formatNumber(Math.round(totalValue / monthCount)) : 0;
              })()}</span></div>
            </div>
          </div>
          
          {/* Monthly Supplied Analytics */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-sm font-semibold text-gray-700 mb-2">{tSuppliersProfile('monthlySuppliedAnalytics')}</div>
            <div className="text-xs text-gray-600">
              <div>{tSuppliersProfile('totalMonthlySupplied')} <span className="font-medium">{totalSupplied}</span></div>
              <div className="border-b border-gray-300 pb-2">{tSuppliersProfile('totalMonthlyRecords')} <span className="font-medium">{(() => {
                // Extract unique months from delivery dates
                const uniqueMonths = new Set();
                historySupplies.forEach((supply: SupplyDetail) => {
                  if (supply.lastDelivery) {
                    const monthKey = supply.lastDelivery.substring(0, 7); // Get YYYY-MM
                    uniqueMonths.add(monthKey);
                  }
                });
                return uniqueMonths.size;
              })()}</span></div>
              <div className="pt-2">{tSuppliersProfile('avgMonthlySupplied')} <span className="font-semibold text-blue-500">{(() => {
                // Extract unique months from delivery dates
                const uniqueMonths = new Set();
                historySupplies.forEach((supply: SupplyDetail) => {
                  if (supply.lastDelivery) {
                    const monthKey = supply.lastDelivery.substring(0, 7); // Get YYYY-MM
                    uniqueMonths.add(monthKey);
                  }
                });
                const monthCount = uniqueMonths.size;
                return monthCount > 0 ? Math.round(totalSupplied / monthCount) : 0;
              })()}</span></div>
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-500 italic mb-2">{tSuppliersProfile('analyticsNote')}</p>
        <div className="flex flex-col gap-6 @4xl/main:flex-row">
          <div className="min-w-0 flex-1 rounded-lg border border-[#e6e6e6] bg-white p-4">
            <div className="text-lg font-semibold text-gray-900 mb-6">{tSuppliersProfile('chartSuppliedPerMonth')}</div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analyticsData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <defs>
                  <linearGradient id="suppliedGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0a61d7" stopOpacity={0.8}/>
                    <stop offset="100%" stopColor="#0a61d7" stopOpacity={0.3}/>
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
                  formatter={(value: number) => [tSuppliersProfile('tooltipSuppliedCount', { count: value }), tSuppliersProfile('tooltipSupplied')]}
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
                  dataKey="supplied" 
                  fill="url(#suppliedGradient)" 
                  radius={[6, 6, 0, 0]}
                  maxBarSize={50}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="min-w-0 flex-1 rounded-lg border border-[#e6e6e6] bg-white p-4">
            <div className="text-lg font-semibold text-gray-900 mb-6">{tSuppliersProfile('chartValuePerMonth')}</div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={analyticsData} margin={{ top: 20, right: 50, left: 50, bottom: 20 }}>
                <defs>
                  <linearGradient id="valueGradient" x1="0" y1="0" x2="0" y2="1">
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
                  formatter={(value: number) => [formatCurrency(Number(value), userCurrency), tSuppliersProfile('tooltipValue')]}
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
                  dataKey="value" 
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
    </div>
  );
}

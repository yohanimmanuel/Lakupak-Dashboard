'use client';
import React from "react";
import { Phone, MapPin, Store, Tag, Truck, Info, FileText, Calendar, BarChart2, ArrowLeft, Edit, Copy, Mail, ChevronLeft, ChevronRight, User } from "lucide-react";
import Link from "next/link";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts';
import { useEffect, useMemo, useState } from 'react';
import { Supplier, SupplyDetail } from '@/types/client';
import { formatDate, formatNumber } from '@/utils/dateUtils';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';
import { parseNumberByCurrency } from '@/config/currencyConfig';
import { useUserStore } from '@/store/userStore';
import { useClientsTranslations } from '@/hooks/useClientsTranslations';
import { TABLE_PAGE_SIZE, getVisiblePageNumbers } from '@/utils/tablePagination';
import {
  getSupplyReceivedInput,
  getSupplyRecordType,
  isSupplyHistoryRow,
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
      if (!isSupplyHistoryRow(supply) || !supply.lastSuppliedDate) return;
      const date = new Date(supply.lastSuppliedDate);
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
  const [showArchivedSupplies, setShowArchivedSupplies] = useState(false);

  // SupplierProfile - Raw supplier data
  
  // Parse supplies and notes from strings to arrays
  const suppliesRaw = supplier.supplies;
  const supplies: SupplyDetail[] = suppliesRaw ? (() => {
    try {
      const parsed: unknown = JSON.parse(suppliesRaw);
      if (!Array.isArray(parsed)) return [];
      // Legacy persisted rows may still expose lastDelivery. Normalize the date
      // while retaining the full SupplyDetail shape used by flexible stock levels.
      return parsed.map((value: unknown): SupplyDetail => {
        const row = value && typeof value === 'object'
          ? value as Record<string, unknown>
          : {};
        const { lastDelivery: legacyLastDelivery, ...rest } = row;
        return {
          ...rest,
          suppliesno: String(row.suppliesno || ''),
          sku: String(row.sku || ''),
          product: String(row.product || ''),
          totalSupplied: String(row.totalSupplied || ''),
          ...getSupplyReceivedInput({
            receivedQuantity: row.receivedQuantity == null ? undefined : String(row.receivedQuantity),
            receivedUnit: row.receivedUnit == null ? undefined : String(row.receivedUnit),
            totalSupplied: String(row.totalSupplied || ''),
          }),
          totalValue: String(row.totalValue || ''),
          lastSuppliedDate: String(row.lastSuppliedDate || legacyLastDelivery || ''),
          status: String(row.status || 'Active'),
          deliverySuccess: row.deliverySuccess == null ? undefined : String(row.deliverySuccess),
          recordType: getSupplyRecordType({
            suppliesno: String(row.suppliesno || ''),
            recordType: row.recordType === 'summary' || row.recordType === 'history'
              ? row.recordType
              : undefined,
          }),
          productId: row.productId == null ? undefined : String(row.productId),
          variantName: row.variantName == null ? undefined : String(row.variantName),
          updateCurrentStock: row.updateCurrentStock === true,
          stockApplied: row.stockApplied === true,
        };
      });
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
    text += `Last Supplied Date: ${logistics?.lastSuppliedDate || logistics?.lastDelivery || ''}\n`;
    text += `Delivery Success: ${logistics?.deliverySuccess || ''}\n`;
    text += `Notes: ${notes.join(', ')}\n`;
    text += `\nSupplies & Product Data:\n`;
    for (const row of supplies) {
      if (!isSupplyHistoryRow(row) || row.archivedAt) continue;
      const received = getSupplyReceivedInput(row);
      const receivedDescription = `${received.receivedQuantity} ${received.receivedUnit}`;
      text += `- Supplies No: ${row.suppliesno}, SKU: ${row.sku}, Product: ${row.product}, Variant: ${row.variantName || 'Default'}, Received: ${receivedDescription}, Total Value: ${row.totalValue}, Last Supplied Date: ${row.lastSuppliedDate}, Status: ${row.status}\\n`;
    }
    navigator.clipboard.writeText(text);
  };
  
  const analyticsData = getSupplierAnalytics(suppliesRaw || '', user?.language);
  const archivedSupplies = useMemo(
    () => supplies.filter((row) => !!row.archivedAt),
    [suppliesRaw],
  );
  const supplyBuckets = useMemo(
    () => partitionSupplies(Array.isArray(supplies) ? supplies.filter((row) => !row.archivedAt) : []),
    [supplies],
  );
  const historySupplies = supplyBuckets.history;
  const openingSupplies = supplyBuckets.summary;
  // The active supplier table is receipt history only. Legacy summary rows remain
  // available to the archived-supplies cleanup view and never affect receipt totals.

  // Headline totals use the current Product variant stock snapshot plus receipt
  // history that has not already been applied to Product stock, all in Pieces.
  const totalSupplied = historySupplies.reduce(
    (sum: number, supply: SupplyDetail) => sum + (Number(supply.totalSupplied) || 0),
    0,
  );
  const totalValue = historySupplies.reduce(
    (sum: number, supply: SupplyDetail) => sum + (parseInt(String(supply.totalValue || '').replace(/[^\d-]/g, ''), 10) || 0),
    0,
  );

  // Monthly analytics remain based on dated supplier receipts only; opening balances
  // are intentionally excluded from monthly activity metrics.
  const historyTotalSupplied = historySupplies.reduce(
    (sum: number, supply: SupplyDetail) => sum + (Number(supply.totalSupplied) || 0),
    0,
  );
  const historyTotalValue = historySupplies.reduce(
    (sum: number, supply: SupplyDetail) => sum + (parseInt(String(supply.totalValue || '').replace(/[^\d-]/g, ''), 10) || 0),
    0,
  );
  const currency = userCurrency;
  
  const [supplyPage, setSupplyPage] = useState(1);
  const supplyRowsPerPage = TABLE_PAGE_SIZE;
  const activeSupplyRows = historySupplies;
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
              { key: 'lastSuppliedDate', value: logistics?.lastSuppliedDate?.trim() },
              { key: 'deliverySuccess', value: logistics?.deliverySuccess?.trim() }
            );
          } else {
            logisticsFields.push(
              { key: 'preferredDays', value: false },
              { key: 'lastSuppliedDate', value: false },
              { key: 'deliverySuccess', value: false }
            );
          }
        } catch {
          logisticsFields.push(
            { key: 'preferredDays', value: false },
            { key: 'lastSuppliedDate', value: false },
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
              <span className="text-gray-500">{user?.language === 'id' ? 'Tanggal Terakhir Disuplai' : 'Last Supplied Date'}</span>
              <span className="font-semibold text-black">
                {(logistics?.lastSuppliedDate || logistics?.lastDelivery) && (logistics.lastSuppliedDate || logistics.lastDelivery).trim() ? (logistics.lastSuppliedDate || logistics.lastDelivery) : <span className="text-red-600 font-bold">{user?.language === 'id' ? 'Belum ada data' : 'Not available'}</span>}
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
          <button type="button" className="rounded-lg border border-[#e6e6e6] bg-white px-3 py-1.5 text-xs font-medium text-black hover:bg-gray-100" onClick={() => setShowArchivedSupplies(true)}>Archived Supplies</button>
        </div>
        {showArchivedSupplies && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Archived Supplies">
            <div className="w-full max-w-3xl max-h-[80vh] overflow-y-auto rounded-xl border border-[#e6e6e6] bg-white p-6 text-gray-900 shadow-2xl">
              <div className="mb-5 flex items-center justify-between border-b border-[#e6e6e6] pb-4"><h2 className="text-lg font-bold text-black">Archived Supplies</h2><button type="button" className="rounded-lg border border-[#e6e6e6] bg-white px-3 py-1.5 text-sm font-medium text-black hover:bg-gray-100" onClick={() => setShowArchivedSupplies(false)}>Close</button></div>
              {openingSupplies.length > 0 && (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  {openingSupplies.length} legacy catalog opening snapshot(s) retained. These are not supplier receipts. Open Edit Supplier to manage eligible snapshots.
                </div>
              )}
              {archivedSupplies.length === 0 ? (
                <div className="rounded-lg border border-[#e6e6e6] bg-gray-50 p-6 text-center text-sm text-gray-600">No archived supplies yet.</div>
              ) : <div className="space-y-2">{archivedSupplies.map((row) => (
                <div key={row.suppliesno} className="rounded-lg border border-[#e6e6e6] bg-white p-4 text-sm text-black">
                  <div className="font-semibold">{row.product} — {row.variantName || 'Default'}</div>
                  <div className="mt-1 text-xs text-gray-500">{row.sku} · {row.totalSupplied} Pieces</div>
                </div>
              ))}</div>}
            </div>
          </div>
        )}
        {/* Summary Statistics */}
        <div className="flex flex-wrap gap-4 mb-4">
          <div className="text-xs text-gray-600 bg-gray-100 rounded px-3 py-1">
            {tSuppliersProfile('totalSuppliedLabel')} <span className="font-bold text-black">{totalSupplied.toLocaleString('en-US')} Pieces</span>
          </div>
          <div className="text-xs text-gray-600 bg-gray-100 rounded px-3 py-1">
                            {tSuppliersProfile('totalPurchaseValueLabel')} <span className="font-bold text-[#0a61d7]">{formatCurrency(totalValue, userCurrency)}</span>
          </div>
        </div>
        <div className="min-w-0 overflow-x-auto rounded-lg">
          <table className="w-max min-w-full whitespace-nowrap text-xs font-medium text-left">
            <thead>
              <tr className="text-gray-500 bg-gray-100 whitespace-nowrap">
                <>
                  <th className="py-2 px-4 font-medium uppercase">{tSuppliersProfile('productName')}</th>
                  <th className="py-2 px-4 font-medium uppercase">{tSuppliersProfile('skuNumber')}</th>
                  <th className="py-2 px-4 font-medium uppercase">Variant</th>
                  <th className="py-2 px-4 font-medium uppercase">{tSuppliersProfile('receivedCol')} (Package Type)</th>
                  <th className="py-2 px-4 font-medium uppercase">{tSuppliersProfile('purchaseValueCol')}</th>
                  <th className="py-2 px-4 font-medium uppercase">{tSuppliersProfile('lastSuppliedDateCol')}</th>
                </>
              </tr>
            </thead>
            <tbody>
              {pagedSupplies.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 px-4 text-center text-sm text-gray-500">
                    {tSuppliersProfile('noSupplies')}
                  </td>
                </tr>
              ) : (
                pagedSupplies.map((supply: SupplyDetail, idx: number) => (
                  <tr
                    key={`hist-${supply.suppliesno || ''}-${idx}-${supplyPage}`}
                    className="border-b last:border-b-0"
                  >
                    <td className="py-4 px-4 text-black">{String(supply.product || '—')}</td>
                    <td className="py-4 px-4 font-medium text-black">{String(supply.sku || '—')}</td>
                    <td className="py-4 px-4 text-black">{String(supply.variantName || '—')}</td>
                    <td className="py-4 px-4 text-black">
                      {getSupplyReceivedInput(supply).receivedQuantity} {getSupplyReceivedInput(supply).receivedUnit}
                    </td>
                    <td className="py-4 px-4 text-[#0a61d7] font-semibold">
                      {formatCurrency(
                        parseNumberByCurrency(String(supply.totalValue), userCurrency),
                        userCurrency,
                      )}
                    </td>
                    <td className="py-4 px-4 text-black">{String(supply.lastSuppliedDate || '—')}</td>
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
              <div>{tSuppliersProfile('totalMonthlyPurchaseValue')} <span className="font-medium">{formatCurrency(historyTotalValue, userCurrency)}</span></div>
              <div className="border-b border-gray-300 pb-2">{tSuppliersProfile('totalMonthlyRecords')} <span className="font-medium">{(() => {
                // Extract unique months from delivery dates
                const uniqueMonths = new Set();
                historySupplies.forEach((supply: SupplyDetail) => {
                  if (supply.lastSuppliedDate) {
                    const monthKey = supply.lastSuppliedDate.substring(0, 7); // Get YYYY-MM
                    uniqueMonths.add(monthKey);
                  }
                });
                return uniqueMonths.size;
              })()}</span></div>
              <div className="pt-2">{tSuppliersProfile('avgMonthlyPurchase')} <span className="font-semibold text-green-500">{currency}{(() => {
                // Extract unique months from delivery dates
                const uniqueMonths = new Set();
                historySupplies.forEach((supply: SupplyDetail) => {
                  if (supply.lastSuppliedDate) {
                    const monthKey = supply.lastSuppliedDate.substring(0, 7); // Get YYYY-MM
                    uniqueMonths.add(monthKey);
                  }
                });
                const monthCount = uniqueMonths.size;
                return monthCount > 0 ? formatNumber(Math.round(historyTotalValue / monthCount)) : 0;
              })()}</span></div>
            </div>
          </div>
          
          {/* Monthly Supplied Analytics */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-sm font-semibold text-gray-700 mb-2">{tSuppliersProfile('monthlySuppliedAnalytics')}</div>
            <div className="text-xs text-gray-600">
              <div>{tSuppliersProfile('totalMonthlySupplied')} <span className="font-medium">{historyTotalSupplied}</span></div>
              <div className="border-b border-gray-300 pb-2">{tSuppliersProfile('totalMonthlyRecords')} <span className="font-medium">{(() => {
                // Extract unique months from delivery dates
                const uniqueMonths = new Set();
                historySupplies.forEach((supply: SupplyDetail) => {
                  if (supply.lastSuppliedDate) {
                    const monthKey = supply.lastSuppliedDate.substring(0, 7); // Get YYYY-MM
                    uniqueMonths.add(monthKey);
                  }
                });
                return uniqueMonths.size;
              })()}</span></div>
              <div className="pt-2">{tSuppliersProfile('avgMonthlySupplied')} <span className="font-semibold text-blue-500">{(() => {
                // Extract unique months from delivery dates
                const uniqueMonths = new Set();
                historySupplies.forEach((supply: SupplyDetail) => {
                  if (supply.lastSuppliedDate) {
                    const monthKey = supply.lastSuppliedDate.substring(0, 7); // Get YYYY-MM
                    uniqueMonths.add(monthKey);
                  }
                });
                const monthCount = uniqueMonths.size;
                return monthCount > 0 ? Math.round(historyTotalSupplied / monthCount) : 0;
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

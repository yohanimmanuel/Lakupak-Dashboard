'use client';
import React from "react";
import { Phone, MapPin, Store, Tag, Truck, Info, FileText, Calendar, BarChart2, ArrowLeft, Edit, Copy, Mail, ChevronLeft, ChevronRight, User, Upload, Download } from "lucide-react";
import Link from "next/link";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts';
import SupplierModal from './SupplierModal';
import { useState } from 'react';
import * as XLSX from 'xlsx';
import ImportSuppliesModal from './ImportSuppliesModal';
import { Supplier, SupplyDetail } from '@/types/client';
import { formatDate, formatNumber } from '@/utils/dateUtils';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';
import { parseNumberByCurrency } from '@/config/currencyConfig';
import { useUserStore } from '@/store/userStore';
import { fetchGraphQL } from '@/lib/graphqlClient';

function getSupplierAnalytics(suppliesStr: string) {
  if (!suppliesStr) return [];
  
  try {
    const supplies = JSON.parse(suppliesStr);
    if (!Array.isArray(supplies)) return [];
    
    // Group by month using YYYY-MM format for proper sorting
    const map: { [monthKey: string]: { supplied: number; value: number; date: Date } } = {};
    supplies.forEach(function(supply: SupplyDetail) {
      if (!supply.lastDelivery) return;
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
      month: data.date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
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
  
  // Get user currency for display
  const userCurrency = user?.currency || getDefaultCurrency();
  const [showEditModal, setShowEditModal] = useState(false);
  const [showImportSupplies, setShowImportSupplies] = useState(false);
  
  // SupplierProfile - Raw supplier data
  
  // Parse supplies and notes from strings to arrays
  const supplies = supplier.supplies ? (() => {
    try {
      const parsed = JSON.parse(supplier.supplies);
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
  
  const analyticsData = getSupplierAnalytics(supplier.supplies || '');
  const totalSupplied = supplies.reduce((sum: number, s: SupplyDetail) => sum + (parseInt(s.totalSupplied) || 0), 0) || 0;
  let totalValue = 0;
  let currency = '';
  supplies.forEach((s: SupplyDetail) => {
    const match = (s.totalValue || '').toString().match(/^([^\d]*)/);
    if (match && match[1] && !currency) currency = match[1];
    totalValue += parseInt((s.totalValue || '').toString().replace(/[^\d]/g, '')) || 0;
  });
  
  const [supplyPage, setSupplyPage] = useState(1);
  const supplyRowsPerPage = 5;
  const totalSupplyRows = supplies.length;
  const totalSupplyPages = Math.max(1, Math.ceil(totalSupplyRows / supplyRowsPerPage));
  const pagedSupplies = supplies.slice((supplyPage - 1) * supplyRowsPerPage, supplyPage * supplyRowsPerPage);

  function handleExportSupplies() {
    const headers = ['SKU', 'Product', 'Total Supplied', 'Total Value', 'Last Delivery'];
    const rows = supplies.map((s: SupplyDetail) => [
      s.sku,
      s.product,
      s.totalSupplied,
      s.totalValue,
      s.lastDelivery
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Supplies');
    XLSX.writeFile(wb, `${supplier.name || 'supplier'}-supplies.xlsx`);
  }

  return (
    <div className="w-full mx-auto bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex flex-col gap-4">
      {/* Header */}
      <div className="items-right justify-between gap-4 mb-2 flex flex-col md:flex-row md:items-center">
        <div className="flex items-center gap-4">
          <Link href="/clients/suppliers" className="text-sm text-gray-500 mb-2">
            <ArrowLeft className="w-5 h-5 text-gray-500 hover:text-gray-700" />
          </Link>
          <div>
            <h2 className="text-2xl font-bold text-black mb-1">Supplier Details</h2>
            <p className="text-sm text-gray-500">View and manage supplier information.</p>
          </div>
        </div>
        <div className="flex gap-2 items-center mt-2 md:mt-0">
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-gray-200 text-black font-medium hover:bg-gray-100 transition text-sm" onClick={handleCopy}>
            <Copy className="w-4 h-4" /> Copy Data
          </button>
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0a61d7] text-white font-semibold hover:bg-[#084ba6] transition text-sm" onClick={() => setShowEditModal(true)}>
            <Edit className="w-4 h-4" /> Edit Details
          </button>
        </div>
      </div>
      
      {/* Data Completion Progress */}
      {(() => {
        // Check all profile fields for missing data (excluding notes and pictures)
        const basicFields = [
          { name: 'Name', value: supplier.name && supplier.name.trim() },
          { name: 'Address', value: supplier.address && supplier.address.trim() },
          { name: 'Business Type', value: supplier.businessType && supplier.businessType.trim() },
          { name: 'Contact', value: supplier.contact && supplier.contact.trim() },
          { name: 'Email', value: supplier.email && supplier.email.trim() },
          { name: 'Phone', value: supplier.phone && supplier.phone.trim() }
        ];
        
        // Check logistics fields
        const logisticsFields = [];
        try {
          if (supplier.logistics) {
            const logistics = JSON.parse(supplier.logistics);
            logisticsFields.push(
              { name: 'Preferred Days', value: logistics?.preferredDays?.trim() },
              { name: 'Last Delivery', value: logistics?.lastDelivery?.trim() },
              { name: 'Delivery Success', value: logistics?.deliverySuccess?.trim() }
            );
          } else {
            logisticsFields.push(
              { name: 'Preferred Days', value: false },
              { name: 'Last Delivery', value: false },
              { name: 'Delivery Success', value: false }
            );
          }
        } catch {
          logisticsFields.push(
            { name: 'Preferred Days', value: false },
            { name: 'Last Delivery', value: false },
            { name: 'Delivery Success', value: false }
          );
        }
        
        // Check supplies data - must have actual supply items with content
        const suppliesFields = [];
        try {
          if (supplier.supplies) {
            const supplies = JSON.parse(supplier.supplies);
            if (!Array.isArray(supplies) || supplies.length === 0) {
              suppliesFields.push({ name: 'Supplies Data', value: false });
            } else {
              // Check if supplies have meaningful content
              const hasValidSupplies = supplies.some((supply: SupplyDetail) => 
                supply.sku && String(supply.sku).trim() &&
                supply.product && String(supply.product).trim() &&
                supply.totalSupplied && String(supply.totalSupplied).trim() &&
                supply.totalValue && String(supply.totalValue).trim()
              );
              suppliesFields.push({ name: 'Supplies Data', value: hasValidSupplies });
            }
          } else {
            suppliesFields.push({ name: 'Supplies Data', value: false });
          }
        } catch {
          suppliesFields.push({ name: 'Supplies Data', value: false });
        }
        
        const allFields = [...basicFields, ...logisticsFields, ...suppliesFields];
        const completedFields = allFields.filter(field => field.value).length;
        const totalFields = allFields.length;
        const completionPercentage = Math.round((completedFields / totalFields) * 100);
        const missingFields = allFields.filter(field => !field.value);
        
        return (
          <div className="mb-4 p-4 bg-gradient-to-r from-blue-50 to-amber-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-800">Profile Completion</h3>
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
              {completedFields} of {totalFields} fields completed
              {missingFields.length > 0 && (
                <span className="ml-2 text-amber-700">
                  • Missing: {missingFields.map(field => field.name).join(', ')}
                </span>
              )}
            </div>
          </div>
        );
      })()}
      
      {/* Top Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* General Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col justify-center relative">
          <div className="absolute left-4 top-4 text-md font-bold text-black">General Information</div>
          <div className="flex flex-col gap-3 mt-8">
            <div className="flex items-center gap-2 text-gray-500 text-xs">
              <Store className="w-4 h-5" />
              <span className="font-semibold text-black text-xs">
                {supplier.name && supplier.name.trim() ? supplier.name : <span className="text-red-600 font-bold">Missing Name</span>} | {supplier.supplierId}
              </span>
            </div>
            <div className="flex items-center gap-2 text-gray-500 text-xs">
              <Tag className="w-4 h-4" />
              <span className="font-medium text-black">
                {supplier.businessType && supplier.businessType.trim() ? supplier.businessType : <span className="text-red-600 font-bold">Missing Business Type</span>}
              </span>
            </div>
            <div className="flex items-center gap-2 text-gray-500 text-xs">
              <MapPin className="w-4 h-4" />
              <span className="font-medium text-black">
                {supplier.address && supplier.address.trim() ? supplier.address : <span className="text-red-600 font-bold">Missing Address</span>}
              </span>
            </div>
            <div className="flex items-center gap-2 text-gray-500 text-xs">
              <Mail className="w-4 h-4" />
              <span className="font-medium text-black">
                {supplier.contact && supplier.contact.trim() ? supplier.contact : <span className="text-red-600 font-bold">Missing Contact</span>} | {supplier.email && supplier.email.trim() ? supplier.email : <span className="text-red-600 font-bold">Missing Email</span>}
              </span>
            </div>
            <div className="flex items-center gap-2 text-gray-500 text-xs">
              <Phone className="w-4 h-4" />
              <span className="font-medium text-black">
                {supplier.phone && supplier.phone.trim() ? supplier.phone : <span className="text-red-600 font-bold">Missing Phone</span>}
              </span>
            </div>
            <div className="flex items-center gap-2 text-gray-500 text-xs">
              <Calendar className="w-4 h-4" />
                             <span className="font-medium text-black">{formatDate(supplier.createdAt)}</span>
            </div>
          </div>
        </div>
        {/* Logistics & Notes */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col gap-2 justify-center relative">
          <div className="absolute left-4 top-4 text-md font-bold text-black">Logistics & Notes</div>
          <div className="flex flex-col gap-2 pt-10">
            <div className="flex items-center gap-2 text-xs">
              <Truck className="w-4 h-4 text-gray-500" />
              <span className="text-gray-500">Preferred Days:</span>
              <span className="font-semibold text-black">
                {logistics?.preferredDays && logistics.preferredDays.trim() ? logistics.preferredDays : <span className="text-red-600 font-bold">Missing Preferred Days</span>}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Info className="w-4 h-4 text-gray-500" />
              <span className="text-gray-500">Last Delivery:</span>
              <span className="font-semibold text-black">
                {logistics?.lastDelivery && logistics.lastDelivery.trim() ? logistics.lastDelivery : <span className="text-red-600 font-bold">Missing Last Delivery</span>}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <BarChart2 className="w-4 h-4 text-gray-500" />
              <span className="text-gray-500">Delivery Success:</span>
              <span className="font-semibold text-black">
                {logistics?.deliverySuccess && logistics.deliverySuccess.trim() ? logistics.deliverySuccess : <span className="text-red-600 font-bold">Missing Delivery Success</span>}
              </span>
            </div>
            <div className="border-t border-gray-200 pt-2 flex items-center gap-2 text-xs mt-2">
              <span className="text-gray-500">Status:</span>
              {supplier.status === 'Active' && (
                <span className="inline-block px-2 py-1 rounded-full font-bold bg-green-100 text-green-500 text-xs">Active</span>
              )}
              {supplier.status === 'Inactive' && (
                <span className="inline-block px-2 py-1 rounded-full font-bold bg-gray-200 text-gray-500 text-xs">Inactive</span>
              )}
              {supplier.status === 'Blocked' && (
                <span className="inline-block px-2 py-1 rounded-full font-bold bg-red-100 text-red-500 text-xs">Blocked</span>
              )}
            </div>
            <div className="text-xs gap-2 mt-2">
              <span className="text-gray-500 mr-2.5">Notes:</span>
              {notes.map((note: string, i: number) => (
                <span key={i} className="inline-block bg-gray-200 text-gray-600 px-2 py-1 rounded-full mr-1">{note}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* Second Row: Supplies/Product Data */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 relative">
        <div className="flex items-center justify-between mb-4">
          <div className="font-semibold text-md text-black">Supplies & Product Data</div>
          <div className="flex gap-2">
            <button className="flex items-center gap-1 px-4 py-2 rounded-lg bg-white border border-gray-200 text-black font-medium hover:bg-gray-100 transition text-sm" onClick={() => setShowImportSupplies(true)}>
              <Upload className="w-4 h-4" /> Import Supplies
            </button>
            <button className="flex items-center gap-1 px-4 py-2 rounded-lg bg-white border border-gray-200 text-black font-medium hover:bg-gray-100 transition text-sm" onClick={handleExportSupplies}>
              <Download className="w-4 h-4" /> Export Supplies
            </button>
          </div>
        </div>
        {showImportSupplies && (
          <ImportSuppliesModal
            open={showImportSupplies}
            onClose={() => setShowImportSupplies(false)}
            onImport={async (newSupplies) => {
              // Merge new supplies with existing ones instead of replacing
              const mergedSupplies = [...supplies, ...newSupplies];
              
              // Update the supplier with merged supplies
              const UPDATE_SUPPLIER_MUTATION = `
                mutation UpdateSupplier(
                  $userId: Int!
                  $id: String
                  $supplierId: String
                  $supplies: String
                ) {
                  updateSupplier(
                    userId: $userId
                    id: $id
                    supplierId: $supplierId
                    supplies: $supplies
                  ) {
                    id
                    supplierId
                    supplies
                  }
                }
              `;
              
              await fetchGraphQL(UPDATE_SUPPLIER_MUTATION, {
                userId: supplier.userId,
                supplierId: supplier.supplierId,
                  supplies: JSON.stringify(mergedSupplies),
              });
              
              // Close modal and refresh the page to show updated data
              setShowImportSupplies(false);
              window.location.reload();
            }}
          />
        )}
        {/* Summary Statistics */}
        <div className="flex flex-wrap gap-4 mb-4">
          <div className="text-xs text-gray-600 bg-gray-100 rounded px-3 py-1">
            Total Supplied: <span className="font-bold text-black">{totalSupplied}</span>
          </div>
          <div className="text-xs text-gray-600 bg-gray-100 rounded px-3 py-1">
                            Total Purchase Value: <span className="font-bold text-[#0a61d7]">{formatCurrency(totalValue, userCurrency)}</span>
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg">
          <table className="min-w-full text-xs font-medium text-left">
            <thead>
              <tr className="text-gray-500 bg-gray-100 whitespace-nowrap">
                <th className="py-2 px-4 font-medium uppercase">No.</th>
                <th className="py-2 px-4 font-medium uppercase">SKU Number</th>
                <th className="py-2 px-4 font-medium uppercase">Product Name</th>
                <th className="py-2 px-4 font-medium uppercase">Total Supplied</th>
                <th className="py-2 px-4 font-medium uppercase">Total Value</th>
                <th className="py-2 px-4 font-medium uppercase">Last Delivery</th>
              </tr>
            </thead>
            <tbody>
              {pagedSupplies.map((supply: SupplyDetail, idx: number) => (
                <tr key={idx + (supplyPage - 1) * supplyRowsPerPage} className="border-b last:border-b-0">
                  <td className="py-4 px-4 font-medium text-black">{(supplyPage - 1) * supplyRowsPerPage + idx + 1}</td>
                  <td className="py-4 px-4 font-medium text-black">{String(supply.sku)}</td>
                  <td className="py-4 px-4 text-black">{String(supply.product)}</td>
                  <td className="py-4 px-4 text-black">{String(supply.totalSupplied)}</td>
                  <td className="py-4 px-4 text-[#0a61d7] font-semibold">{formatCurrency(parseNumberByCurrency(String(supply.totalValue), userCurrency), userCurrency)}</td>
                  <td className="py-4 px-4 text-black">{String(supply.lastDelivery)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Pagination Info and Controls */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mt-4 gap-2">
            <div className="text-xs text-gray-500">
              {`Showing ${(supplyPage - 1) * supplyRowsPerPage + (totalSupplyRows === 0 ? 0 : 1)} to ${Math.min(supplyPage * supplyRowsPerPage, totalSupplyRows)} of ${totalSupplyRows}`}
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50"
                onClick={() => setSupplyPage(p => Math.max(1, p - 1))}
                disabled={supplyPage === 1}
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4 text-gray-500" />
              </button>
              {Array.from({ length: totalSupplyPages }, (_, i) => i + 1).map(p => (
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
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          </div>
        </div>
      </div>
      {/* Third Row: Analytics */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="font-semibold text-black mb-2">Analytics</div>
        
        {/* Analytics Cards Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Monthly Purchase Analytics */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-sm font-semibold text-gray-700 mb-2">Monthly Purchase Analytics</div>
            <div className="text-xs text-gray-600">
              <div>Total Monthly Purchase Value: <span className="font-medium">{formatCurrency(totalValue, userCurrency)}</span></div>
              <div className="border-b border-gray-300 pb-2">Total Monthly Records: <span className="font-medium">{(() => {
                // Extract unique months from delivery dates
                const uniqueMonths = new Set();
                supplies.forEach((supply: SupplyDetail) => {
                  if (supply.lastDelivery) {
                    const monthKey = supply.lastDelivery.substring(0, 7); // Get YYYY-MM
                    uniqueMonths.add(monthKey);
                  }
                });
                return uniqueMonths.size;
              })()}</span></div>
              <div className="pt-2">Average Monthly Purchase: <span className="font-semibold text-green-500">{currency}{(() => {
                // Extract unique months from delivery dates
                const uniqueMonths = new Set();
                supplies.forEach((supply: SupplyDetail) => {
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
            <div className="text-sm font-semibold text-gray-700 mb-2">Monthly Supplied Analytics</div>
            <div className="text-xs text-gray-600">
              <div>Total Monthly Supplied: <span className="font-medium">{totalSupplied}</span></div>
              <div className="border-b border-gray-300 pb-2">Total Monthly Records: <span className="font-medium">{(() => {
                // Extract unique months from delivery dates
                const uniqueMonths = new Set();
                supplies.forEach((supply: SupplyDetail) => {
                  if (supply.lastDelivery) {
                    const monthKey = supply.lastDelivery.substring(0, 7); // Get YYYY-MM
                    uniqueMonths.add(monthKey);
                  }
                });
                return uniqueMonths.size;
              })()}</span></div>
              <div className="pt-2">Average Monthly Supplied: <span className="font-semibold text-blue-500">{(() => {
                // Extract unique months from delivery dates
                const uniqueMonths = new Set();
                supplies.forEach((supply: SupplyDetail) => {
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
        <p className="text-xs text-gray-500 italic mb-2">Note: Data analysis will appear after all supplies details are added/completed.</p>
        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="text-lg font-semibold text-gray-900 mb-6">Total Supplied Per Month</div>
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
                  formatter={(value: number) => [`${value} units`, 'Supplied']}
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
          <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="text-lg font-semibold text-gray-900 mb-6">Total Value Per Month</div>
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
                  formatter={(value: number) => [formatCurrency(Number(value), userCurrency), 'Value']}
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
      </div>
      <SupplierModal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSave={async () => {
          setShowEditModal(false);
          // Trigger SWR refresh if available, otherwise reload page
          if (onUpdate) {
            await onUpdate();
          } else {
            window.location.reload();
          }
        }}
        initialData={supplier}
        mode="edit"
      />
    </div>
  );
}

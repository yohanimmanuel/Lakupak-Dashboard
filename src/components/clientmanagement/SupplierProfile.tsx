'use client';
import React from "react";
import { Phone, MapPin, Store, Tag, Truck, Info, FileText, Calendar, BarChart2, ArrowLeft, Edit, Copy, Mail } from "lucide-react";
import Link from "next/link";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts';
import SupplierModal from './SupplierModal';
import { useState } from 'react';

// Try require fallback for date-fns if import fails
let parse: any, format: any;
try {
  // @ts-ignore
  ({ parse, format } = require('date-fns'));
} catch {
  // fallback to import if available
}

function getSupplierAnalytics(supplies: any[]) {
  // Group by month (MMM yyyy)
  const map: { [month: string]: { supplied: number; value: number } } = {};
  supplies.forEach(function(supply: any) {
    if (!supply.lastDelivery) return;
    const date = parse(supply.lastDelivery, 'yyyy-MM-dd', new Date());
    const monthKey = format(date, 'MMM yyyy');
    const totalSupplied = Number(supply.totalSupplied) || 0;
    // Remove non-numeric from totalValue (e.g. 'Rp 60,000,000')
    const value = Number((supply.totalValue || '').toString().replace(/[^\d]/g, '')) / 1_000_000;
    if (!map[monthKey]) map[monthKey] = { supplied: 0, value: 0 };
    map[monthKey].supplied += totalSupplied;
    map[monthKey].value += value;
  });
  // Sort months chronologically
  const months = Object.keys(map).sort((a, b) => {
    const dA = parse(a, 'MMM yyyy', new Date());
    const dB = parse(b, 'MMM yyyy', new Date());
    return dA.getTime() - dB.getTime();
  });
  return months.map((month) => ({
    month,
    supplied: map[month].supplied,
    value: map[month].value,
  }));
}

export default function SupplierProfile({ supplier, onClose }: { supplier: any; onClose?: () => void }) {
  const [showEditModal, setShowEditModal] = useState(false);
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
    text += `Preferred Delivery Days: ${supplier.logistics?.preferredDays || ''}\n`;
    text += `Last Delivery: ${supplier.logistics?.lastDelivery || ''}\n`;
    text += `Delivery Success: ${supplier.logistics?.deliverySuccess || ''}\n`;
    text += `Notes: ${(supplier.notes || []).join(', ')}\n`;
    text += `\nSupplies & Product Data:\n`;
    for (const row of supplier.supplies) {
      text += `- Supplies No: ${row.suppliesno}, SKU: ${row.sku}, Product: ${row.product}, Total Supplied: ${row.totalSupplied}, Total Value: ${row.totalValue}, Last Delivery: ${row.lastDelivery}, Status: ${row.status}\n`;
    }
    navigator.clipboard.writeText(text);
  };
  const analyticsData = getSupplierAnalytics(supplier.supplies || []);
  const totalSupplied = supplier.supplies?.reduce((sum: number, s: any) => sum + (parseInt(s.totalSupplied) || 0), 0) || 0;
  let totalValue = 0;
  let currency = '';
  supplier.supplies?.forEach((s: any) => {
    const match = (s.totalValue || '').toString().match(/^([^\d]*)/);
    if (match && match[1] && !currency) currency = match[1];
    totalValue += parseInt((s.totalValue || '').toString().replace(/[^\d]/g, '')) || 0;
  });
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
      {/* Top Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* General Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col justify-center relative">
          <div className="absolute left-4 top-4 text-md font-bold text-black">General Information</div>
          <div className="flex flex-col gap-3 mt-8">
            <div className="flex items-center gap-2 text-gray-500 text-xs">
              <Store className="w-4 h-5" />
              <span className="font-semibold text-black text-xs">{supplier.name} | {supplier.id}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-500 text-xs">
              <Tag className="w-4 h-4" />
              <span className="font-medium text-black">{supplier.businessType}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-500 text-xs">
              <MapPin className="w-4 h-4" />
              <span className="font-medium text-black">{supplier.address}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-500 text-xs">
              <Mail className="w-4 h-4" />
              <span className="font-medium text-black">{supplier.contact} | {supplier.email}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-500 text-xs">
              <Phone className="w-4 h-4" />
              <span className="font-medium text-black">{supplier.phone}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-500 text-xs">
              <Calendar className="w-4 h-4" />
              <span className="font-medium text-black">{supplier.createdAt}</span>
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
              <span className="font-semibold text-black">{supplier.logistics.preferredDays}</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Info className="w-4 h-4 text-gray-500" />
              <span className="text-gray-500">Last Delivery:</span>
              <span className="font-semibold text-black">{supplier.logistics.lastDelivery}</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <BarChart2 className="w-4 h-4 text-gray-500" />
              <span className="text-gray-500">Delivery Success:</span>
              <span className="font-semibold text-black">{supplier.logistics.deliverySuccess}</span>
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
              {supplier.notes.map((note: string, i: number) => (
                <span key={i} className="inline-block bg-gray-200 text-gray-600 px-2 py-1 rounded-full mr-1">{note}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* Second Row: Supplies/Product Data */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="font-semibold text-md text-black">Supplies & Product Data</div>
        </div>
        <div className="flex flex-wrap gap-4 mb-2">
          <div className="text-xs text-gray-600 bg-gray-100 rounded px-3 py-1">Total Supplied: <span className="font-bold text-black">{totalSupplied}</span></div>
          <div className="text-xs text-gray-600 bg-gray-100 rounded px-3 py-1">Total Value: <span className="font-bold text-[#0a61d7]">{currency}{totalValue.toLocaleString()}</span></div>
        </div>
        <div className="overflow-x-auto rounded-lg">
          <table className="min-w-full text-xs font-medium text-left">
            <thead>
              <tr className="text-gray-500 bg-gray-100 whitespace-nowrap">
                <th className="py-2 px-4 font-medium uppercase">Supplies No</th>
                <th className="py-2 px-4 font-medium uppercase">SKU</th>
                <th className="py-2 px-4 font-medium uppercase">Product</th>
                <th className="py-2 px-4 font-medium uppercase">Total Supplied</th>
                <th className="py-2 px-4 font-medium uppercase">Total Value</th>
                <th className="py-2 px-4 font-medium uppercase">Last Delivery</th>
              </tr>
            </thead>
            <tbody>
              {supplier.supplies.map((supply: any) => (
                <tr key={String(supply.sku)} className="border-b last:border-b-0">
                  <td className="py-2 px-4 font-medium text-black">{String(supply.suppliesno)}</td>
                  <td className="py-2 px-4 font-medium text-black">{String(supply.sku)}</td>
                  <td className="py-2 px-4 text-black">{String(supply.product)}</td>
                  <td className="py-2 px-4 text-black">{String(supply.totalSupplied)}</td>
                  <td className="py-2 px-4 text-[#0a61d7] font-semibold">{String(supply.totalValue)}</td>
                  <td className="py-2 px-4 text-black">{String(supply.lastDelivery)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {/* Third Row: Analytics */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="font-semibold text-black mb-2">Analytics</div>
        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex-1 border border-gray-200 rounded-lg p-4">
            <div className="text-sm text-gray-500 mb-2">Total Supplied Per Month</div>
            <div className="w-full h-100 bg-white flex items-center justify-center text-gray-400">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analyticsData} margin={{ top: 30, right: 50, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#0a61d7' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#0a61d7' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(value) => `${value} units`} />
                  <Bar dataKey="supplied" fill="#0a61d7" radius={[6, 6, 0, 0]} barSize={50} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="flex-1 border border-gray-200 rounded-lg p-4">
            <div className="text-sm text-gray-500 mb-2">Total Value Per Month</div>
            <div className="w-full h-100 bg-white flex items-center justify-center text-gray-400">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analyticsData} margin={{ top: 30, right: 50, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#0a61d7' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#0a61d7' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(value) => `Rp ${value}M`} />
                  <Line type="monotone" dataKey="value" stroke="#f65911" strokeWidth={3} dot={{ r: 4, fill: '#f65911' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
      <SupplierModal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSave={() => setShowEditModal(false)}
        initialData={supplier}
        mode="edit"
      />
    </div>
  );
}

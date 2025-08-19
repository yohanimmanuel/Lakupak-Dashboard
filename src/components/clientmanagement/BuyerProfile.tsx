'use client';

import React from "react";
import { Phone, MapPin, Store, Tag, Truck, Info, FileText, Calendar, DollarSign, BarChart2, ArrowLeft, Edit, Copy, Mail } from "lucide-react";
import Link from "next/link";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts';
import BuyerModal from './BuyerModal';
import { useState } from 'react';

// Try require fallback for date-fns if import fails
let parse: any, format: any;
try {
  // @ts-ignore
  ({ parse, format } = require('date-fns'));
} catch {
  // fallback to import if available
}

function getBuyerAnalytics(orderDetails: any[]) {
  // Group by month (MMM yyyy)
  const map: { [month: string]: { orders: number; spending: number } } = {};
  orderDetails.forEach((order: any) => {
    if (!order.lastOrderDate) return;
    const date = parse(order.lastOrderDate, 'yyyy-MM-dd', new Date());
    const monthKey = format(date, 'MMM yyyy');
    const totalOrders = Number(order.totalOrders) || 0;
    // Remove non-numeric from totalSpend (e.g. 'Rp 12,000,000')
    const spending = Number((order.totalSpend || '').toString().replace(/[^\d]/g, '')) / 1_000_000;
    if (!map[monthKey]) map[monthKey] = { orders: 0, spending: 0 };
    map[monthKey].orders += totalOrders;
    map[monthKey].spending += spending;
  });
  // Sort months chronologically
  const months = Object.keys(map).sort((a, b) => {
    const dA = parse(a, 'MMM yyyy', new Date());
    const dB = parse(b, 'MMM yyyy', new Date());
    return dA.getTime() - dB.getTime();
  });
  return months.map((month) => ({
    month,
    orders: map[month].orders,
    spending: map[month].spending,
  }));
}

export default function BuyerProfile({ buyer, onClose }: { buyer: any; onClose?: () => void }) {
  const [showEditModal, setShowEditModal] = useState(false);
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
    text += `Preferred Delivery Days: ${buyer.logistics?.preferredDays || ''}\n`;
    text += `Last Shipment: ${buyer.logistics?.lastShipment || ''}\n`;
    text += `Shipment Success: ${buyer.logistics?.shipmentSuccess || ''}\n`;
    text += `Notes: ${(buyer.notes || []).join(', ')}\n`;
    text += `\nOrder & Product Details:\n`;
    for (const row of buyer.orderDetails) {
      text += `- Order No: ${row.orderNo}, Product: ${row.product}, Total Orders: ${row.totalOrders}, Total Spend: ${row.totalSpend}, Last Order Date: ${row.lastOrderDate}, Outstanding: ${row.outstanding}\n`;
    }
    navigator.clipboard.writeText(text);
  };
  const analyticsData = getBuyerAnalytics(buyer?.orderDetails || []);
  const totalOrders = buyer.orderDetails?.reduce((sum: number, o: any) => sum + (parseInt(o.totalOrders) || 0), 0) || 0;
  let totalSpend = 0;
  let currency = '';
  buyer.orderDetails?.forEach((o: any) => {
    const match = (o.totalSpend || '').toString().match(/^([^\d]*)/);
    if (match && match[1] && !currency) currency = match[1];
    totalSpend += parseInt((o.totalSpend || '').toString().replace(/[^\d]/g, '')) || 0;
  });
  const totalOutstanding = buyer.orderDetails?.reduce((sum: number, o: any) => sum + (parseInt((o.outstanding || '').toString().replace(/[^\d]/g, '')) || 0), 0) || 0;
  return (
    <div className="w-full mx-auto bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex flex-col gap-4">
      <div className="items-right justify-between gap-4 mb-2 flex flex-col md:flex-row md:items-center">
        <div className="flex items-center gap-4">
          <Link href="/clients/buyers" className="text-sm text-gray-500 mb-2">
            <ArrowLeft className="w-5 h-5 text-gray-500 hover:text-gray-700" />
          </Link>
          <div>
            <h2 className="text-2xl font-bold text-black mb-1">Buyer Details</h2>
            <p className="text-sm text-gray-500">View and manage buyer information.</p>
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Avatar & Owner */}
        <div className="flex flex-col items-center justify-center bg-white rounded-lg border border-gray-200 p-4 gap-3">
          <img src={buyer.avatar} alt={buyer.owner} className="w-20 h-20 rounded-full object-cover border-4 border-white shadow" />
          <div className="text-lg font-bold text-black mt-2">{buyer.owner}</div>
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <Mail className="w-4 h-4" />
            <span>{buyer.email}</span> | <Phone className="w-4 h-4" />
            <span>{buyer.phone}</span>
          </div>
          <div className="flex items-center gap-2 text-gray-500 text-xs">
            <span className="font-medium text-gray-500">ID: {buyer.buyerId}</span>
          </div>
        </div>
        {/* General Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col justify-center relative">
          <div className="absolute left-4 top-4 text-md font-bold text-black">General Information</div>
            <div className="flex flex-col gap-4 mt-4">
              <div className="flex items-center gap-2 text-gray-500 text-xs">
                <Store className="w-4 h-5" />
                <span className="font-semibold text-black text-sm">{buyer.storeName}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-500 text-xs">
                <Tag className="w-4 h-4" />
                <span className="font-medium text-black">{buyer.businessType}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-500 text-xs">
                <MapPin className="w-4 h-4" />
                <span className="font-medium text-black">{buyer.address}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-500 text-xs">
                <Calendar className="w-4 h-4" />
                <span className="font-medium text-black">{buyer.createdAt}</span>
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
              <span className="font-semibold text-black">{buyer.logistics?.preferredDays || ''}</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Info className="w-4 h-4 text-gray-500" />
              <span className="text-gray-500">Last Shipment:</span>
              <span className="font-semibold text-black">{buyer.logistics?.lastShipment || ''}</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <BarChart2 className="w-4 h-4 text-gray-500" />
              <span className="text-gray-500">Shipment Success:</span>
              <span className="font-semibold text-black">{buyer.logistics?.shipmentSuccess || ''}</span>
            </div>
            <div className="border-t border-gray-200 pt-2 flex items-center gap-2 text-xs mt-2">
              <span className="text-gray-500">Status:</span>
              {buyer.status === 'Active' && (
                <span className="inline-block px-2 py-1 rounded-full font-bold bg-green-100 text-green-500 text-xs">Active</span>
              )}
              {buyer.status === 'Inactive' && (
                <span className="inline-block px-2 py-1 rounded-full font-bold bg-gray-200 text-gray-500 text-xs">Inactive</span>
              )}
              {buyer.status === 'Blocked' && (
                <span className="inline-block px-2 py-1 rounded-full font-bold bg-red-100 text-red-500 text-xs">Blocked</span>
              )}
            </div>
            <div className="text-xs gap-2 mt-2">
              <span className="text-gray-500 mr-2.5">Notes:</span>
              {buyer.notes.map((note: string, i: number) => (
                <span key={i} className="inline-block bg-gray-200 text-gray-600 px-2 py-1 rounded-full mr-1">{note}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* Second Row: Order/Product Details */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="font-semibold text-md text-black">Order & Product Details</div>
        </div>
        <div className="flex flex-wrap gap-4 mb-2">
          <div className="text-xs text-gray-600 bg-gray-100 rounded px-3 py-1">Total Orders: <span className="font-bold text-black">{totalOrders}</span></div>
          <div className="text-xs text-gray-600 bg-gray-100 rounded px-3 py-1">Total Spend: <span className="font-bold text-[#0a61d7]">{currency}{totalSpend.toLocaleString()}</span></div>
          <div className="text-xs text-gray-600 bg-gray-100 rounded px-3 py-1">Outstanding: <span className="font-bold text-[#f65911]">{currency}{totalOutstanding.toLocaleString()}</span></div>
        </div>
        <div className="overflow-x-auto rounded-lg">
          <table className="min-w-full text-xs font-medium text-left">
            <thead>
              <tr className="text-gray-500 bg-gray-100 whitespace-nowrap">
                <th className="py-2 px-4 font-medium uppercase">No.</th>
                <th className="py-2 px-4 font-medium uppercase">Product Name</th>
                <th className="py-2 px-4 font-medium uppercase">Total Orders (Boxes)</th>
                <th className="py-2 px-4 font-medium uppercase">Total Spend (Rp)</th>
                <th className="py-2 px-4 font-medium uppercase">Last Order Date</th>
                <th className="py-2 px-4 font-medium uppercase">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {buyer.orderDetails.map((order: any, idx: number) => (
                <tr key={idx} className="border-b last:border-b-0">
                  <td className="py-4 px-4 font-medium text-black">{idx + 1}</td>
                  <td className="py-4 px-4 text-black">{order.product}</td>
                  <td className="py-4 px-4 text-black">{order.totalOrders}</td>
                  <td className="py-4 px-4 text-[#0a61d7] font-semibold">{order.totalSpend}</td>
                  <td className="py-4 px-4 text-black">{order.lastOrderDate}</td>
                  <td className="py-4 px-4 text-[#f65911] font-semibold">{order.outstanding}</td>
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
          <div className="flex-1 border border-gray-200 rounded-lg p-4  ">
            <div className="text-sm text-gray-500 mb-2">Total Orders Per Month</div>
            <div className="w-full h-100 bg-white flex items-center justify-center text-gray-400">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analyticsData} margin={{ top: 30, right: 50, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#0a61d7' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#0a61d7' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(value) => `${value} orders`} />
                  <Bar dataKey="orders" fill="#0a61d7" radius={[6, 6, 0, 0]} barSize={50} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="flex-1 border border-gray-200 rounded-lg p-4">
            <div className="text-sm text-gray-500 mb-2">Total Spending Per Month</div>
            <div className="w-full h-100 bg-white flex items-center justify-center text-gray-400">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analyticsData} margin={{ top: 30, right: 50, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#0a61d7' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#0a61d7' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(value) => `Rp ${value}M`} />
                  <Line type="monotone" dataKey="spending" stroke="#f65911" strokeWidth={3} dot={{ r: 4, fill: '#f65911' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
      <BuyerModal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSave={() => setShowEditModal(false)}
        initialData={buyer}
        mode="edit"
      />
    </div>
  );
}

'use client';
import React, { useState, useEffect } from 'react';
import Statcards from '@/components/clientmanagement/Statcards';
import BuyerTable from "@/components/clientmanagement/BuyerTable";
import BuyerModal from '@/components/clientmanagement/BuyerModal';
import { Plus, Upload, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import ImportData from '@/components/clientmanagement/ImportData';
import { useUserStore } from '@/store/userStore';
import { Buyer, BuyerTableRow, BuyerFormData, OrderDetail } from '@/types/client';

function downloadXLSX(wb: XLSX.WorkBook, filename: string) {
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/octet-stream' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

function profileToTableRow(buyer: Buyer): BuyerTableRow {
  let totalSpend = 0;
  let currency = '';
  let outstanding = 0;
  
  // Parse orderDetails from string to array
  const orderDetails = buyer.orderDetails ? (() => {
    try {
      return JSON.parse(buyer.orderDetails);
    } catch {
      return [];
    }
  })() : [];
  
  if (Array.isArray(orderDetails) && orderDetails.length > 0) {
          orderDetails.forEach((o: OrderDetail) => {
      // Extract currency prefix (e.g. 'Rp ', '$ ', etc.)
      const match = (o.totalSpend || '').toString().match(/^([^ - \d]*)/);
      if (match && match[1] && !currency) currency = match[1];
      totalSpend += parseInt((o.totalSpend || '').toString().replace(/[^ - \d]/g, '')) || 0;
    });
    outstanding = orderDetails.reduce((sum: number, o: OrderDetail) => sum + (parseInt((o.outstanding || '').toString().replace(/[^ - \d]/g, '')) || 0), 0);
  }
  
  // Format numbers with thousands separator and currency, ensure space after Rp
  const formattedCurrency = (currency || 'Rp').trim() + ' ';
  const formattedTotalSpend = formattedCurrency + totalSpend.toLocaleString('id-ID');
  const formattedOutstanding = formattedCurrency + outstanding.toLocaleString('id-ID');
  
  return {
    id: buyer.id || 0,
    buyerId: buyer.buyerId,
    avatar: buyer.avatar,
    owner: buyer.owner,
    name: buyer.storeName,
    email: buyer.email,
    phone: buyer.phone,
    storeName: buyer.storeName,
    businessType: buyer.businessType,
    address: buyer.address,
    status: buyer.status,
    totalOrders: Array.isArray(orderDetails) ? orderDetails.reduce((sum: number, o: OrderDetail) => sum + (parseInt(o.totalOrders) || 0), 0).toString() : '0',
    totalSpend: formattedTotalSpend,
    outstanding: formattedOutstanding,
    createdAt: buyer.createdAt ? new Date(buyer.createdAt).toLocaleDateString() : '',
    lastUpdated: buyer.updatedAt ? new Date(buyer.updatedAt).toLocaleDateString() : '',
    userId: buyer.userId || 0,
  };
}

function generateBuyerId() {
  return 'LKB-' + Math.floor(10000000 + Math.random() * 90000000).toString();
}

export default function BuyersPage() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [loading, setLoading] = useState(false);
  const user = useUserStore(state => state.user);

  // Utility function to calculate monthly averages (same logic as BuyerProfile)
  const calculateMonthlyAverages = (orderDetails: OrderDetail[]) => {
    if (!orderDetails || orderDetails.length === 0) {
      return { avgMonthlyOrders: 0, avgMonthlySpending: 0 };
    }
    
    // Calculate total orders and spending
    let totalOrders = 0;
    let totalSpending = 0;
    
    orderDetails.forEach((order: OrderDetail) => {
      totalOrders += parseInt(order.totalOrders) || 0;
      totalSpending += parseInt((order.totalSpend || '0').toString().replace(/[^\d]/g, '')) || 0;
    });
    
    // Extract unique months from order dates
    const uniqueMonths = new Set();
    orderDetails.forEach((order: OrderDetail) => {
      if (order.lastOrderDate) {
        const monthKey = order.lastOrderDate.substring(0, 7); // Get YYYY-MM
        uniqueMonths.add(monthKey);
      }
    });
    
    const monthCount = uniqueMonths.size;
    
    // Calculate averages (same logic as BuyerProfile)
    const avgMonthlyOrders = monthCount > 0 ? Math.round(totalOrders / monthCount) : 0;
    const avgMonthlySpending = monthCount > 0 ? Math.round(totalSpending / monthCount) : 0;
    
    return { avgMonthlyOrders, avgMonthlySpending };
  };

  const fetchBuyers = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/buyers?userId=${user.id}`);
      if (!res.ok) {
        console.error('Failed to fetch buyers:', res.status, res.statusText);
        setBuyers([]);
        setLoading(false);
        return;
      }
      const data = await res.json();
      console.log('Raw buyers data:', data);
      const buyersData = Array.isArray(data) ? data : [];
      
      // Calculate monthly analytics for each buyer
      const buyersWithAnalytics = buyersData.map(buyer => {
        const orderDetails = buyer.orderDetails ? JSON.parse(buyer.orderDetails) : [];
        
        // Calculate monthly averages using the same logic as BuyerProfile
        const { avgMonthlyOrders, avgMonthlySpending } = calculateMonthlyAverages(orderDetails);
        
        return {
          ...buyer,
          avgMonthlyOrders,
          avgMonthlySpending
        };
      });
      
      console.log('Processed buyers data:', buyersWithAnalytics);
      setBuyers(buyersWithAnalytics);
    } catch (error) {
      console.error('Error fetching buyers:', error);
      setBuyers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBuyers();
  }, [user?.id]);

  const handleAddBuyer = async (data: BuyerFormData) => {
    if (!user?.id) return;
    await fetch('/api/buyers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, userId: user.id }),
    });
    setShowAddModal(false);
    fetchBuyers();
  };

  return (
    <div className="p-4 w-full min-h-screen flex flex-col items-right bg-gradient-to-b from-gray-50 to-white">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-2">
        <div>
          <h2 className="text-2xl font-bold text-black mb-2">Buyers List</h2>
          <p className="text-sm text-gray-500 mb-4">Manage your buyers and their information.</p>
          <p className="text-xs text-gray-500 italic">Note: Please use the same currency for all buyers to ensure accurate statistics.</p>
        </div>
        <div className="flex gap-2 items-center">
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-gray-200 text-black font-medium hover:bg-gray-100 transition text-sm"
            onClick={() => setShowImportModal(true)}
          >
            <Upload className="w-4 h-4" /> Import Data
          </button>
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-gray-200 text-black font-medium hover:bg-gray-100 transition text-sm"
            onClick={() => document.getElementById('buyer-table-export-xlsx-trigger')?.click()}
          >
            <Download className="w-4 h-4" /> Export Data
          </button>
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0a61d7] text-white font-semibold hover:bg-[#084ba6] transition text-sm"
            onClick={() => setShowAddModal(true)}
          >
            <Plus className="w-4 h-4" /> Add Buyer
          </button>
        </div>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-[#0a61d7] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">Loading buyers...</p>
          </div>
        </div>
      ) : (
        <>
          <Statcards type="buyer" data={buyers} />
          <BuyerTable buyers={buyers} setBuyers={setBuyers} onExportXLSX={downloadXLSX} profileToTableRow={profileToTableRow} />
        </>
      )}
      <BuyerModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={async (data) => {
          setShowAddModal(false);
          await fetchBuyers();
        }}
      />
      <ImportData
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImport={async (data) => {
          setShowImportModal(false);
          if (!user?.id) return;
          for (const buyer of data) {
            const payload = {
              buyerId: buyer.ID,
              storeName: buyer['Store Name'] || '-',
              owner: buyer['Owner'] || '-',
              email: buyer['Email'] || '-',
              phone: buyer['Phone'] || '-',
              businessType: buyer['Business Type'] || '-',
              address: buyer['Address'] || '-',
              status: buyer['Status'] || '-',
              createdAt: buyer['Created At'] || new Date().toISOString(),
              logistics: JSON.stringify({
                preferredDays: buyer['Preferred Delivery Days'] || '-',
                lastShipment: buyer['Last Shipment'] || '-',
                shipmentSuccess: buyer['Shipment Success'] || '-',
              }),
              notes: JSON.stringify(buyer['Notes'] ? [buyer['Notes']] : []),
              orderDetails: JSON.stringify(buyer.orderDetails || []),
              userId: user.id,
            };
            await fetch('/api/buyers', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
          }
          fetchBuyers();
        }}
        type="Buyers"
      />
    </div>
  );
}
  
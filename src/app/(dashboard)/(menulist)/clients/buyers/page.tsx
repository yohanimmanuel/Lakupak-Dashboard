'use client';
import React, { useState, useEffect } from 'react';
import Statcards from '@/components/clientmanagement/Statcards';
import BuyerTable from "@/components/clientmanagement/BuyerTable";
import BuyerModal from '@/components/clientmanagement/BuyerModal';
import { Plus, Upload, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import ImportData from '@/components/clientmanagement/ImportData';
import { useUserStore } from '@/store/userStore';

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

function profileToTableRow(buyer: any) {
  let totalSpend = 0;
  let currency = '';
  let outstanding = 0;
  let lastOrderDate = '';
  if (Array.isArray(buyer.orderDetails) && buyer.orderDetails.length > 0) {
    buyer.orderDetails.forEach((o: any) => {
      // Extract currency prefix (e.g. 'Rp ', '$ ', etc.)
      const match = (o.totalSpend || '').toString().match(/^([^ - \d]*)/);
      if (match && match[1] && !currency) currency = match[1];
      totalSpend += parseInt((o.totalSpend || '').toString().replace(/[^ - \d]/g, '')) || 0;
    });
    outstanding = buyer.orderDetails.reduce((sum: number, o: any) => sum + (parseInt((o.outstanding || '').toString().replace(/[^ - \d]/g, '')) || 0), 0);
    lastOrderDate = buyer.orderDetails[buyer.orderDetails.length - 1].lastOrderDate || '';
  }
  // Format numbers with thousands separator and currency, ensure space after Rp
  const formattedCurrency = (currency || 'Rp').trim() + ' ';
  const formattedTotalSpend = formattedCurrency + totalSpend.toLocaleString('id-ID');
  const formattedOutstanding = formattedCurrency + outstanding.toLocaleString('id-ID');
  return {
    id: buyer.id,
    buyerId: buyer.buyerId,
    name: buyer.storeName,
    address: buyer.address,
    businessType: buyer.businessType,
    totalOrders: Array.isArray(buyer.orderDetails) ? buyer.orderDetails.reduce((sum: number, o: any) => sum + (parseInt(o.totalOrders) || 0), 0) : 0,
    lastOrderDate,
    totalSpend: formattedTotalSpend,
    outstanding: formattedOutstanding,
    status: buyer.status,
  };
}

function generateBuyerId() {
  return 'LKB-' + Math.floor(10000000 + Math.random() * 90000000).toString();
}

export default function BuyersPage() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [buyers, setBuyers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const user = useUserStore(state => state.user);

  const fetchBuyers = async () => {
    if (!user?.id) return;
    setLoading(true);
    const res = await fetch(`/api/buyers?userId=${user.id}`);
    const data = await res.json();
    setBuyers(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => {
    fetchBuyers();
  }, [user?.id]);

  const handleAddBuyer = async (data: any) => {
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
          <p className="text-sm text-gray-500 mb-2">Manage your buyers and their information.</p>
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
      <Statcards type="buyer" />
      <BuyerTable buyers={buyers} setBuyers={setBuyers} onExportXLSX={downloadXLSX} profileToTableRow={profileToTableRow} />
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
              logistics: {
                preferredDays: buyer['Preferred Delivery Days'] || '-',
                lastShipment: buyer['Last Shipment'] || '-',
                shipmentSuccess: buyer['Shipment Success'] || '-',
              },
              notes: buyer['Notes'] ? [buyer['Notes']] : [],
              orderDetails: buyer.orderDetails || [],
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
  
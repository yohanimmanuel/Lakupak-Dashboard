'use client';
import React, { useState, useEffect } from 'react';
import Statcards from '@/components/clientmanagement/Statcards';
import SupplierTable from "@/components/clientmanagement/SupplierTable";
import SupplierModal from '@/components/clientmanagement/SupplierModal';
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

function profileToTableRow(supplier: any) {
  let totalPurchases = 0;
  let currency = '';
  let totalSupplied = 0;
  if (Array.isArray(supplier.supplies) && supplier.supplies.length > 0) {
    supplier.supplies.forEach((s: any) => {
      // Extract currency prefix (e.g. 'Rp ', '$ ', etc.)
      const match = (s.totalValue || '').toString().match(/^([^-\d]*)/);
      if (match && match[1] && !currency) currency = match[1];
      totalPurchases += parseInt((s.totalValue || '').toString().replace(/[^-\d]/g, '')) || 0;
    });
    totalSupplied = supplier.supplies.reduce((sum: number, s: any) => sum + (parseInt(s.totalSupplied) || 0), 0);
  }
  // Format number with thousands separator and currency, ensure space after Rp
  const formattedCurrency = (currency || 'Rp').trim() + ' ';
  const formattedTotalPurchases = formattedCurrency + totalPurchases.toLocaleString('id-ID');
  return {
    id: supplier.id,
    supplierId: supplier.supplierId,
    name: supplier.name,
    contact: supplier.contact,
    businessType: supplier.businessType,
    address: supplier.address,
    totalPurchases: formattedTotalPurchases,
    totalSupplies: totalSupplied,
    createdAt: supplier.createdAt,
    status: supplier.status,
  };
}

function generateSupplierId() {
  return 'LKS-' + Math.floor(10000000 + Math.random() * 90000000).toString();
}

export default function SuppliersPage() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const user = useUserStore(state => state.user);

  const fetchSuppliers = async () => {
    if (!user?.id) return;
    setLoading(true);
    const res = await fetch(`/api/suppliers?userId=${user.id}`);
    const data = await res.json();
    setSuppliers(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => {
    fetchSuppliers();
  }, [user?.id]);

  const handleAddSupplier = async (data: any) => {
    if (!user?.id) return;
    await fetch('/api/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, userId: user.id }),
    });
    setShowAddModal(false);
    fetchSuppliers();
  };

  return (
    <div className="p-4 w-full min-h-screen flex flex-col items-right bg-gradient-to-b from-gray-50 to-white">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-2">
        <div>
          <h2 className="text-2xl font-bold text-black mb-2">Suppliers List</h2>
          <p className="text-sm text-gray-500 mb-2">Manage your suppliers and their information.</p>
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
            onClick={() => document.getElementById('supplier-table-export-xlsx-trigger')?.click()}
          >
            <Download className="w-4 h-4" /> Export Data
          </button>
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0a61d7] text-white font-semibold hover:bg-[#084ba6] transition text-sm"
            onClick={() => setShowAddModal(true)}
          >
            <Plus className="w-4 h-4" /> Add Supplier
          </button>
        </div>
      </div>
      <Statcards type="supplier" data={suppliers} />
      <SupplierTable suppliers={suppliers} setSuppliers={setSuppliers} onExportXLSX={downloadXLSX} profileToTableRow={profileToTableRow} />
      <SupplierModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={async (data) => {
          setShowAddModal(false);
          await fetchSuppliers();
        }}
      />
      <ImportData
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImport={async (data) => {
          setShowImportModal(false);
          if (!user?.id) return;
          for (const supplier of data) {
            const payload = {
              supplierId: supplier.ID,
              name: supplier['Supplier Name'] || '-',
              contact: supplier['Contact'] || '-',
              email: supplier['Email'] || '-',
              phone: supplier['Phone'] || '-',
              businessType: supplier['Business Type'] || '-',
              address: supplier['Address'] || '-',
              status: supplier['Status'] || '-',
              createdAt: supplier['Created At'] || new Date().toISOString(),
              logistics: {
                preferredDays: supplier['Preferred Delivery Days'] || '-',
                lastDelivery: supplier['Last Delivery'] || '-',
                deliverySuccess: supplier['Delivery Success'] || '-',
              },
              notes: supplier['Notes'] ? [supplier['Notes']] : [],
              supplies: supplier.supplies || [],
              userId: user.id,
            };
            await fetch('/api/suppliers', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
          }
          fetchSuppliers();
        }}
        type="Suppliers"
      />
    </div>
  );
}
  
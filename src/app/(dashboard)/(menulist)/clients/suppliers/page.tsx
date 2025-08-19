'use client';
import React, { useState, useEffect } from 'react';
import Statcards from '@/components/clientmanagement/Statcards';
import SupplierTable from "@/components/clientmanagement/SupplierTable";
import SupplierModal from '@/components/clientmanagement/SupplierModal';
import { Plus, Upload, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import ImportData from '@/components/clientmanagement/ImportData';

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
  let lastDelivery = '';
  if (Array.isArray(supplier.supplies) && supplier.supplies.length > 0) {
    supplier.supplies.forEach((s: any) => {
      // Extract currency prefix (e.g. 'Rp ', '$ ', etc.)
      const match = (s.totalValue || '').toString().match(/^([^\d]*)/);
      if (match && match[1] && !currency) currency = match[1];
      totalPurchases += parseInt((s.totalValue || '').toString().replace(/[^\d]/g, '')) || 0;
    });
    totalSupplied = supplier.supplies.reduce((sum: number, s: any) => sum + (parseInt(s.totalSupplied) || 0), 0);
    lastDelivery = supplier.supplies[supplier.supplies.length - 1].lastDelivery || '';
  }
  return {
    id: supplier.id,
    supplierId: supplier.supplierId,
    name: supplier.name,
    contact: supplier.contact,
    businessType: supplier.businessType,
    address: supplier.address,
    totalPurchases: currency + totalPurchases.toLocaleString(),
    totalSupplied,
    lastDelivery,
    status: supplier.status,
  };
}

export default function SuppliersPage() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSuppliers = async () => {
    setLoading(true);
    const res = await fetch('/api/suppliers');
    const data = await res.json();
    setSuppliers(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const handleAddSupplier = async (data: any) => {
    await fetch('/api/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
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
      <Statcards type="supplier" />
      <SupplierTable suppliers={suppliers} onExportXLSX={downloadXLSX} profileToTableRow={profileToTableRow} />
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
          // Bulk import suppliers
          for (const supplier of data) {
            const supplierId = supplier["ID"] ? String(supplier["ID"]) : (supplier.supplierId ? String(supplier.supplierId) : "Unknown");
            const payload = {
              supplierId,
              name: supplier["Supplier Name"] || supplier.name || "Unknown",
              contact: supplier["Contact"] || supplier.contact || "Unknown",
              email: supplier["Email"] || supplier.email || "Unknown",
              phone: supplier["Phone"] || supplier.phone || "Unknown",
              businessType: supplier["Business Type"] || supplier.businessType || "Unknown",
              address: supplier["Address"] || supplier.address || "Unknown",
              status: supplier["Status"] || supplier.status || "Unknown",
              createdAt: supplier["Created At"] ? new Date(supplier["Created At"]).toISOString() : new Date().toISOString(),
              logistics: {
                preferredDays: supplier["Preferred Delivery Days"] || "Unknown",
                lastDelivery: supplier["Last Delivery"] || "Unknown",
                deliverySuccess: supplier["Delivery Success"] || "Unknown",
              },
              notes: supplier["Notes"] ? [supplier["Notes"]] : [],
              supplies: supplier.supplies || [],
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
  
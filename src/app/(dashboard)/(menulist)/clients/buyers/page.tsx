'use client';
import Statcards from '@/components/clientmanagement/Statcards';
import BuyerTable from "@/components/clientmanagement/BuyerTable";
import BuyerModal from '@/components/clientmanagement/BuyerModal';
import { Plus, Upload, Download } from 'lucide-react';
import React, { useState } from 'react';
import * as XLSX from 'xlsx';

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

export default function BuyersPage() {
  const [showAddModal, setShowAddModal] = useState(false);

  return (
    <div className="p-4 w-full min-h-screen flex flex-col items-right bg-gradient-to-b from-gray-50 to-white">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-2">
        <div>
          <h2 className="text-2xl font-bold text-black mb-2">Buyers List</h2>
          <p className="text-sm text-gray-500 mb-2">Manage your buyers and their information.</p>
        </div>
        <div className="flex gap-2 items-center">
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-gray-200 text-black font-medium hover:bg-gray-100 transition text-sm">
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
      <BuyerTable onExportXLSX={downloadXLSX} />
      <BuyerModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={(data) => {
          setShowAddModal(false);
          // handle save logic here
        }}
      />
    </div>
  );
}
  
'use client';

import React, { useMemo, useRef, useState } from 'react';
import {
  Upload,
  X,
  FileText,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { OrderDetail, SupplyDetail } from '@/types/client';
import { getDefaultCurrency } from '@/utils/currencyUtils';
import { useUserStore } from '@/store/userStore';
import { useClientsTranslations } from '@/hooks/useClientsTranslations';

const PREVIEW_PAGE_SIZE = 8;

type BuyerImportRow = {
  [key: string]: string | OrderDetail[] | undefined;
  'ID': string;
  'Store Name': string;
  'Owner': string;
  'Phone': string;
  'Email': string;
  'Address': string;
  'Business Type': string;
  'Status': string;
  'Created At': string;
  'Preferred Delivery Days': string;
  'Last Shipment': string;
  'Shipment Success': string;
  'Notes': string;
  'Order Details': string;
  orderDetails?: OrderDetail[];
};
type SupplierImportRow = {
  [key: string]: string | SupplyDetail[] | undefined;
  'ID': string;
  'Supplier Name': string;
  'Contact': string;
  'Phone': string;
  'Email': string;
  'Business Type': string;
  'Address': string;
  'Status': string;
  'Created At': string;
  'Preferred Delivery Days': string;
  'Last Delivery': string;
  'Delivery Success': string;
  'Notes': string;
  'Supplies': string;
  supplies?: SupplyDetail[];
};

type ImportType = 'Buyers' | 'Suppliers';

type ImportDataProps = {
  open: boolean;
  onClose: () => void;
  onImport: (data: BuyerImportRow[] | SupplierImportRow[]) => void | Promise<void>;
  type?: ImportType;
};

type ImportRow = BuyerImportRow | SupplierImportRow;

function parseOrderDetails(cell: string | undefined, userCurrency: string): OrderDetail[] {
  if (!cell) return [];
  try {
    const parsed = JSON.parse(cell);
    if (Array.isArray(parsed)) {
      return parsed.map((order: OrderDetail) => ({
        ...order,
        totalSpend: standardizeCurrencyFormat(order.totalSpend, userCurrency),
        outstanding: standardizeCurrencyFormat(order.outstanding, userCurrency)
      }));
    }
    return [];
  } catch {
    return [];
  }
}

function parseSupplies(cell: string | undefined, userCurrency: string): SupplyDetail[] {
  if (!cell) return [];
  try {
    const parsed = JSON.parse(cell);
    if (Array.isArray(parsed)) {
      return parsed.map((supply: SupplyDetail) => ({
        ...supply,
        totalValue: standardizeCurrencyFormat(supply.totalValue, userCurrency)
      }));
    }
    return [];
  } catch {
    return [];
  }
}

// Currency format standardization function - only changes display format, preserves actual values
function standardizeCurrencyFormat(value: string | undefined, targetCurrency: string): string {
  if (!value) return '';
  
  const valueStr = value.toString().trim();
  if (!valueStr) return '';
  
  // Extract the numeric part while preserving original formatting (commas, dots, etc.)
  // Remove only the currency prefix/symbol but keep the number format exactly as is
  const match = valueStr.match(/^[^\d]*(.+)$/);
  if (!match) return valueStr; // Return original if no pattern found
  
  const numericPart = match[1].trim();
  if (!numericPart) return valueStr; // Return original if no numbers found
  
  // Simply replace the currency symbol/code with the target currency, preserve exact number format
  return `${targetCurrency} ${numericPart}`;
}

// Add mapping state and helpers
const buyerFields = [
  { key: 'ID', labelKey: 'id' },
  { key: 'Store Name', labelKey: 'storeName' },
  { key: 'Owner', labelKey: 'owner' },
  { key: 'Phone', labelKey: 'phone' },
  { key: 'Email', labelKey: 'email' },
  { key: 'Address', labelKey: 'address' },
  { key: 'Business Type', labelKey: 'businessType' },
  { key: 'Status', labelKey: 'status' },
  { key: 'Created At', labelKey: 'createdAt' },
  { key: 'Preferred Delivery Days', labelKey: 'preferredDeliveryDays' },
  { key: 'Last Shipment', labelKey: 'lastShipment' },
  { key: 'Shipment Success', labelKey: 'shipmentSuccess' },
  { key: 'Notes', labelKey: 'notes' },
  { key: 'Order Details', labelKey: 'orderDetails' },
];
const supplierFields = [
  { key: 'ID', labelKey: 'id' },
  { key: 'Supplier Name', labelKey: 'supplierName' },
  { key: 'Contact', labelKey: 'contact' },
  { key: 'Phone', labelKey: 'phone' },
  { key: 'Email', labelKey: 'email' },
  { key: 'Business Type', labelKey: 'businessType' },
  { key: 'Address', labelKey: 'address' },
  { key: 'Status', labelKey: 'status' },
  { key: 'Created At', labelKey: 'createdAt' },
  { key: 'Preferred Delivery Days', labelKey: 'preferredDeliveryDays' },
  { key: 'Last Delivery', labelKey: 'lastDelivery' },
  { key: 'Delivery Success', labelKey: 'deliverySuccess' },
  { key: 'Notes', labelKey: 'notes' },
  { key: 'Supplies', labelKey: 'supplies' },
];

// Synonyms for automapping
const buyerSynonyms: { [key: string]: string[] } = {
  'ID': ['id', 'buyer id', 'kode', 'kode buyer'],
  'Store Name': ['store name', 'toko', 'nama toko', 'buyer name', 'name'],
  'Owner': ['owner', 'pemilik', 'owner name', 'nama owner'],
  'Phone': ['phone', 'no hp', 'no telepon', 'telepon', 'phone number', 'no telp'],
  'Email': ['email', 'e-mail', 'mail'],
  'Address': ['address', 'alamat', 'alamat toko', 'store address'],
  'Business Type': ['business type', 'tipe bisnis', 'jenis usaha', 'type'],
  'Status': ['status', 'buyer status'],
  'Created At': ['created at', 'tanggal dibuat', 'created'],
  'Preferred Delivery Days': ['preferred delivery days', 'hari pengiriman', 'delivery days'],
  'Last Shipment': ['last shipment', 'pengiriman terakhir', 'last delivery'],
  'Shipment Success': ['shipment success', 'success rate', 'shipment rate'],
  'Notes': ['notes', 'catatan', 'tags'],
  'Order Details': ['order details', 'orders', 'order', 'order json'],
};
const supplierSynonyms: { [key: string]: string[] } = {
  'ID': ['id', 'supplier id', 'kode', 'kode supplier'],
  'Supplier Name': ['supplier name', 'nama supplier', 'name'],
  'Contact': ['contact', 'contact person', 'contact name', 'person'],
  'Phone': ['phone', 'no hp', 'no telepon', 'telepon', 'phone number', 'no telp'],
  'Email': ['email', 'e-mail', 'mail'],
  'Business Type': ['business type', 'tipe bisnis', 'jenis usaha', 'type'],
  'Address': ['address', 'alamat', 'alamat supplier', 'supplier address'],
  'Status': ['status', 'supplier status'],
  'Created At': ['created at', 'tanggal dibuat', 'created'],
  'Preferred Delivery Days': ['preferred delivery days', 'hari pengiriman', 'delivery days'],
  'Last Delivery': ['last delivery', 'pengiriman terakhir', 'last shipment'],
  'Delivery Success': ['delivery success', 'success rate', 'delivery rate'],
  'Notes': ['notes', 'catatan', 'tags'],
  'Supplies': ['supplies', 'supply', 'supply json'],
};

function generateBuyerId() {
  return 'LKB-' + Math.floor(10000000 + Math.random() * 90000000).toString();
}
function generateSupplierId() {
  return 'LKS-' + Math.floor(10000000 + Math.random() * 90000000).toString();
}

/** Drop blank Excel trailing rows (used-range padding) so preview count matches real data. */
function isNonEmptyRow(row: Record<string, string>) {
  return Object.values(row).some((v) => String(v ?? '').trim() !== '');
}

function ImportSelectionCheckbox({
  checked,
  indeterminate = false,
  onToggle,
  ariaLabel,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onToggle: () => void;
  ariaLabel: string;
}) {
  const isActive = checked || indeterminate;

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={ariaLabel}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className={`w-5 h-5 border-2 rounded transition-all duration-200 flex items-center justify-center shrink-0 ${
        isActive ? 'bg-green-500 border-green-500' : 'bg-white border-gray-300 hover:border-green-400'
      }`}
    >
      {checked && !indeterminate ? (
        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      ) : null}
      {indeterminate ? <span className="block w-2.5 h-0.5 bg-white rounded-full" /> : null}
    </button>
  );
}

export default function ImportData({ open, onClose, onImport, type = 'Buyers' }: ImportDataProps) {
  const user = useUserStore(state => state.user);
  const userCurrency = user?.currency || getDefaultCurrency();
  const { tImport, tShared } = useClientsTranslations();

  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<number>(0); // 0: upload, 1: mapping, 2: preview
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [error, setError] = useState<string>('');
  const [filename, setFilename] = useState<string>('');
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<{ [key: string]: string }>({});
  const [previewPage, setPreviewPage] = useState(1);
  const [importing, setImporting] = useState(false);
  const [selectedRowIndices, setSelectedRowIndices] = useState<Set<number>>(new Set());

  const fields = type === 'Buyers' ? buyerFields : supplierFields;
  const synonyms = type === 'Buyers' ? buyerSynonyms : supplierSynonyms;
  const getFieldLabel = (labelKey: string) =>
    type === 'Buyers'
      ? tImport(`buyerFields.${labelKey}`)
      : tImport(`supplierFields.${labelKey}`);

  // Automap columns to fields using synonyms
  function getAutomap(fileHeaders: string[]) {
    const mapping: { [key: string]: string } = {};
    fields.forEach(f => {
      const syns = [f.key, ...(synonyms[f.key] || [])];
      const found = fileHeaders.find(h => syns.some(s => s.toLowerCase() === h.trim().toLowerCase()));
      if (found) mapping[f.key] = found;
    });
    return mapping;
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError('');
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setFilename(file.name);
    const ext = file.name.split('.').pop()?.toLowerCase();
    const reader = new FileReader();
    reader.onload = (evt: ProgressEvent<FileReader>) => {
      if (!evt.target || !evt.target.result) {
        setError(tImport('fileReadError'));
        return;
      }
      let workbook: XLSX.WorkBook;
      if (ext === 'csv') {
        const text = evt.target.result as string;
        workbook = XLSX.read(text, { type: 'string' });
      } else {
        const data = new Uint8Array(evt.target.result as ArrayBuffer);
        workbook = XLSX.read(data, { type: 'array' });
      }
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        blankrows: false,
        defval: '',
      });
      if (!json.length) {
        setError(tImport('fileEmpty'));
        return;
      }
      const fileHeadersRow = (json[0] as string[]).map((h) => String(h ?? '').trim());
      const dataRows = json
        .slice(1)
        .map((row: unknown[]): ImportRow => {
          const cells = Array.isArray(row) ? row : [];
          const obj: Record<string, string> = {};
          fileHeadersRow.forEach((h, i) => {
            if (!h) return;
            obj[h] = cells[i] != null ? String(cells[i]) : '';
          });
          return obj as ImportRow;
        })
        .filter(isNonEmptyRow);
      setFileHeaders(fileHeadersRow.filter(Boolean));
      setRows(dataRows);
      setSelectedRowIndices(new Set(dataRows.map((_, index) => index)));
      setMapping(getAutomap(fileHeadersRow.filter(Boolean)));
      setStep(1); // mapping step
    };
    if (ext === 'csv') {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  };

  // Stable mapped rows for preview + import (avoids regenerating IDs on each page change)
  const mappedRows = useMemo(() => {
    return rows.map((row: ImportRow) => {
      const mapped: Partial<BuyerImportRow | SupplierImportRow> = {};
      fields.forEach(f => {
        const col = mapping[f.key];
        mapped[f.key as keyof (BuyerImportRow | SupplierImportRow)] = col ? row[col] : '';
      });
      if (type === 'Buyers') {
        mapped.ID = generateBuyerId();
        mapped.orderDetails = parseOrderDetails(mapped['Order Details'] as string, userCurrency);
      } else {
        mapped.ID = generateSupplierId();
        mapped.supplies = parseSupplies(mapped['Supplies'] as string, userCurrency);
      }
      return mapped;
    });
  }, [rows, mapping, type, userCurrency, fields]);

  const totalPreviewPages = Math.max(1, Math.ceil(mappedRows.length / PREVIEW_PAGE_SIZE));
  const safePreviewPage = Math.min(previewPage, totalPreviewPages);
  const previewFrom = mappedRows.length === 0 ? 0 : (safePreviewPage - 1) * PREVIEW_PAGE_SIZE + 1;
  const previewTo = Math.min(safePreviewPage * PREVIEW_PAGE_SIZE, mappedRows.length);
  const pageStartIndex = (safePreviewPage - 1) * PREVIEW_PAGE_SIZE;
  const pagedPreviewRows = mappedRows.slice(pageStartIndex, pageStartIndex + PREVIEW_PAGE_SIZE);

  const selectedMappedRows = mappedRows.filter((_, index) => selectedRowIndices.has(index));
  const allRowsSelected = mappedRows.length > 0 && selectedRowIndices.size === mappedRows.length;
  const someRowsSelected = selectedRowIndices.size > 0 && !allRowsSelected;

  const toggleRowSelection = (index: number) => {
    setSelectedRowIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleAllRowSelection = () => {
    if (allRowsSelected) {
      setSelectedRowIndices(new Set());
      return;
    }
    setSelectedRowIndices(new Set(mappedRows.map((_, index) => index)));
  };

  const resetState = () => {
    setRows([]);
    setStep(0);
    setFilename('');
    setFileHeaders([]);
    setMapping({});
    setPreviewPage(1);
    setImporting(false);
    setSelectedRowIndices(new Set());
    setError('');
  };

  const handleImport = async () => {
    if (importing) return;
    if (selectedMappedRows.length === 0) {
      setError(tImport('importNoneSelected'));
      return;
    }
    setImporting(true);
    setError('');
    try {
      if (type === 'Buyers') {
        await onImport(selectedMappedRows as BuyerImportRow[]);
      } else {
        await onImport(selectedMappedRows as SupplierImportRow[]);
      }
      resetState();
      onClose();
    } catch {
      setImporting(false);
      setError(tImport('fileProcessFailed'));
    }
  };

  const handleClose = () => {
    if (importing) return;
    resetState();
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl border border-[#e6e6e6] p-4 w-full max-w-3xl relative">
        <button
          className="absolute top-3 right-3 p-2 rounded-full hover:bg-gray-100 disabled:opacity-50"
          onClick={handleClose}
          disabled={importing}
        >
          <X className="w-5 h-5 text-black" />
        </button>
        <h2 className="text-xl font-bold text-black mb-4 border-b border-[#e6e6e6] pb-2 flex items-center gap-2">
          <FileText className="w-5 h-5 text-[#0a61d7]" /> {type === 'Buyers' ? tImport('titleBuyers') : tImport('titleSuppliers')}
        </h2>
        {step === 0 && (
          <div className="flex flex-col items-center justify-center gap-4 py-8">
            <input type="file" accept=".xlsx,.xls,.csv" ref={inputRef} className="hidden" onChange={handleFile} />
            <button type="button" className="flex flex-col items-center gap-2 px-6 py-4 rounded-lg border-2 border-dashed border-[#0a61d7] bg-[#f7faff] hover:bg-[#e6f0ff] transition" onClick={() => inputRef.current && inputRef.current.click()}>
              <Upload className="w-8 h-8 text-[#0a61d7]" />
              <span className="text-[#0a61d7] font-semibold">{tImport('upload')}</span>
              {filename && <span className="text-xs text-gray-500">{filename}</span>}
            </button>
            {error && <div className="flex items-center gap-2 text-red-500 text-sm"><AlertTriangle className="w-4 h-4" /> {error}</div>}
          </div>
        )}
        {step === 1 && (
          <div className="flex flex-col gap-1 max-h-[550px] overflow-y-auto">
            <div className="mb-2 font-semibold text-black">{tImport('mapColumnsOptional')}</div>
            <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-blue-700 text-sm flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  <strong>{tImport('flexibleImport')}</strong> {tImport('flexibleImportHint')}
                </span>
              </p>
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white p-2">
              <table className="min-w-full text-xs font-medium text-left">
                <thead>
                  <tr className="text-gray-500 bg-gray-100 whitespace-nowrap">
                    <th className="py-2 px-3 font-medium uppercase">{tImport('field')}</th>
                    <th className="py-2 px-3 font-medium uppercase">{tImport('mapToColumn')}</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map(f => (
                    <tr key={f.key} className="whitespace-nowrap">
                      <td className="py-1 px-3 font-semibold text-black">{getFieldLabel(f.labelKey)}</td>
                      <td className="py-1 px-3">
                        <select
                          className="w-full border border-gray-200 rounded px-2 py-1 text-black text-xs"
                          value={mapping[f.key] || ''}
                          onChange={e => setMapping(m => ({ ...m, [f.key]: e.target.value }))}
                        >
                          <option value="">{tImport('notMapped')}</option>
                          {fileHeaders.map(h => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2 mt-2 text-sm border-t border-gray-200 pt-4">
              <button type="button" className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200" onClick={() => { setStep(0); setRows([]); setFilename(''); setFileHeaders([]); setMapping({}); }}>{tImport('back')}</button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-[#0a61d7] text-white font-semibold hover:bg-[#084ba6] flex items-center gap-2"
                onClick={() => {
                  setPreviewPage(1);
                  setSelectedRowIndices(new Set(rows.map((_, index) => index)));
                  setStep(2);
                }}
              >
                {tImport('preview')}
              </button>
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3 text-black">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-[#0a61d7]" />
                {tImport('previewRowsSelected', {
                  selected: selectedRowIndices.size,
                  total: mappedRows.length,
                })}
              </div>
              <div className="flex items-center gap-2">
                <ImportSelectionCheckbox
                  checked={allRowsSelected}
                  indeterminate={someRowsSelected}
                  onToggle={toggleAllRowSelection}
                  ariaLabel={allRowsSelected ? tImport('deselectAll') : tImport('selectAll')}
                />
                <button
                  type="button"
                  className="text-sm text-gray-700 font-medium hover:text-black"
                  onClick={toggleAllRowSelection}
                >
                  {allRowsSelected ? tImport('deselectAll') : tImport('selectAll')}
                </button>
              </div>
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-200 max-h-[360px]">
              <table className="min-w-full text-xs font-medium text-left bg-white">
                <thead className="sticky top-0 z-10">
                  <tr className="text-gray-500 bg-gray-100 whitespace-nowrap">
                    <th className="py-2 px-3 font-medium uppercase w-12">
                      <ImportSelectionCheckbox
                        checked={allRowsSelected}
                        indeterminate={someRowsSelected}
                        onToggle={toggleAllRowSelection}
                        ariaLabel={allRowsSelected ? tImport('deselectAll') : tImport('selectAll')}
                      />
                    </th>
                    {fields.map(f => <th key={f.key} className="py-2 px-3 font-medium uppercase">{getFieldLabel(f.labelKey)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {pagedPreviewRows.map((row, idx) => {
                    const absoluteIndex = pageStartIndex + idx;
                    const isSelected = selectedRowIndices.has(absoluteIndex);
                    return (
                      <tr
                        key={`${safePreviewPage}-${absoluteIndex}`}
                        onClick={() => toggleRowSelection(absoluteIndex)}
                        className={`whitespace-nowrap text-black cursor-pointer ${
                          isSelected ? 'hover:bg-blue-50/40' : 'opacity-50 bg-gray-50 hover:bg-gray-100'
                        }`}
                      >
                        <td className="py-2 px-3">
                          <ImportSelectionCheckbox
                            checked={isSelected}
                            onToggle={() => toggleRowSelection(absoluteIndex)}
                            ariaLabel={tImport('selectRow', { index: absoluteIndex + 1 })}
                          />
                        </td>
                        {fields.map(f => <td key={f.key} className="py-2 px-3">{
                          (() => {
                            const value = row[f.key as keyof typeof row];
                            if (typeof value === 'string') return value;
                            if (Array.isArray(value)) return JSON.stringify(value);
                            return String(value || '');
                          })()
                        }</td>)}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <p className="text-gray-600">
                {tImport('previewShowing', {
                  from: previewFrom,
                  to: previewTo,
                  total: mappedRows.length,
                })}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="p-2 rounded-lg border border-[#e6e6e6] hover:bg-gray-50 disabled:opacity-50"
                  onClick={() => setPreviewPage((p) => Math.max(1, Math.min(p, totalPreviewPages) - 1))}
                  disabled={safePreviewPage <= 1 || importing}
                  aria-label={tShared('previousPage')}
                >
                  <ChevronLeft className="w-4 h-4 text-gray-600" />
                </button>
                <span className="min-w-[7rem] text-center text-gray-700 font-medium">
                  {tImport('previewPage', { page: safePreviewPage, totalPages: totalPreviewPages })}
                </span>
                <button
                  type="button"
                  className="p-2 rounded-lg border border-[#e6e6e6] hover:bg-gray-50 disabled:opacity-50"
                  onClick={() => setPreviewPage((p) => Math.min(totalPreviewPages, Math.max(1, p) + 1))}
                  disabled={safePreviewPage >= totalPreviewPages || importing}
                  aria-label={tShared('nextPage')}
                >
                  <ChevronRight className="w-4 h-4 text-gray-600" />
                </button>
              </div>
            </div>
            {error ? (
              <div className="flex items-center gap-2 text-red-500 text-sm">
                <AlertTriangle className="w-4 h-4" /> {error}
              </div>
            ) : null}
            <div className="flex justify-end gap-2 mt-2 text-sm border-t border-gray-200 pt-4">
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 disabled:opacity-50"
                onClick={() => setStep(1)}
                disabled={importing}
              >
                {tImport('back')}
              </button>
              <button
                type="button"
                className="min-w-[180px] justify-center px-4 py-2 rounded-lg bg-[#0a61d7] text-white font-semibold hover:bg-[#084ba6] flex items-center gap-2 disabled:opacity-60"
                onClick={() => void handleImport()}
                disabled={importing || selectedRowIndices.size === 0}
              >
                {importing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> {tImport('importing')}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />{' '}
                    {tImport('importButtonSelected', { count: selectedRowIndices.size })}
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

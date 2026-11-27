'use client';

import React, { useMemo, useState } from 'react';
import {
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
import { useClientsTranslations } from '@/hooks/useClientsTranslations';
import ImportSelectionCheckbox from '@/components/clientmanagement/ImportSelectionCheckbox';
import ImportStartPanel, { type ImportColumnGuide, getDuplicateImportMappingErrors } from '@/components/imports/ImportStartPanel';

const PREVIEW_PAGE_SIZE = 8;

type BuyerImportRow = {
  [key: string]: string | undefined;
  ID: string;
  'Store Name': string;
  Owner: string;
  Phone: string;
  Email: string;
  Address: string;
  'Main Channel': string;
  'Sub-channel': string;
  'Outlet Specifics': string;
  Status: string;
  'Created At': string;
  'Last Order Date': string;
  'Last Visit Date': string;
  'Shipment Success': string;
  Notes: string;
  preferredDays?: string;
};
type SupplierImportRow = {
  [key: string]: string | undefined;
  ID: string;
  'Supplier Name': string;
  Contact: string;
  Phone: string;
  Email: string;
  'Business Type': string;
  Address: string;
  Status: string;
  'Created At': string;
  'Last Supplied Date': string;
  'Delivery Success': string;
  Notes: string;
  preferredDays?: string;
};

type ImportType = 'Buyers' | 'Suppliers';

type ImportDataProps = {
  open: boolean;
  onCloseAction: () => void;
  onImportAction: (data: BuyerImportRow[] | SupplierImportRow[]) => void | Promise<void>;
  type?: ImportType;
};

type ImportRow = BuyerImportRow | SupplierImportRow;

type MasterImportField = { key: string; labelKey: string };

const buyerFields: MasterImportField[] = [
  { key: 'ID', labelKey: 'id' },
  { key: 'Store Name', labelKey: 'storeName' },
  { key: 'Owner', labelKey: 'owner' },
  { key: 'Phone', labelKey: 'phone' },
  { key: 'Email', labelKey: 'email' },
  { key: 'Address', labelKey: 'address' },
  { key: 'Main Channel', labelKey: 'businessType' },
  { key: 'Sub-channel', labelKey: 'subChannel' },
  { key: 'Outlet Specifics', labelKey: 'outletSpecifics' },
  { key: 'Status', labelKey: 'status' },
  { key: 'Created At', labelKey: 'createdAt' },
  { key: 'Preferred Delivery Days', labelKey: 'preferredDeliveryDays' },
  { key: 'Last Order Date', labelKey: 'lastShipment' },
  { key: 'Last Visit Date', labelKey: 'lastVisit' },
  { key: 'Shipment Success', labelKey: 'shipmentSuccess' },
  { key: 'Notes', labelKey: 'notes' },
];
const supplierFields: MasterImportField[] = [
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
  { key: 'Last Supplied Date', labelKey: 'lastSuppliedDate' },
  { key: 'Delivery Success', labelKey: 'deliverySuccess' },
  { key: 'Notes', labelKey: 'notes' },
];

const LEGACY_WEEKDAY_COLUMNS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const LEGACY_WEEKDAY_HEADERS: Record<(typeof LEGACY_WEEKDAY_COLUMNS)[number], string[]> = {
  Monday: ['Preferred Delivery Monday', 'Monday'],
  Tuesday: ['Preferred Delivery Tuesday', 'Tuesday'],
  Wednesday: ['Preferred Delivery Wednesday', 'Wednesday'],
  Thursday: ['Preferred Delivery Thursday', 'Thursday'],
  Friday: ['Preferred Delivery Friday', 'Friday'],
  Saturday: ['Preferred Delivery Saturday', 'Saturday'],
  Sunday: ['Preferred Delivery Sunday', 'Sunday'],
};
const PREFERRED_DELIVERY_DAY_ALIASES: Record<string, (typeof LEGACY_WEEKDAY_COLUMNS)[number]> = {
  mon: 'Monday', monday: 'Monday', mons: 'Monday', mondays: 'Monday',
  tue: 'Tuesday', tues: 'Tuesday', tuesday: 'Tuesday', tuesdays: 'Tuesday',
  wed: 'Wednesday', weds: 'Wednesday', wednesday: 'Wednesday', wednesdays: 'Wednesday',
  thu: 'Thursday', thur: 'Thursday', thurs: 'Thursday', thursday: 'Thursday', thursdays: 'Thursday',
  fri: 'Friday', friday: 'Friday', fridays: 'Friday',
  sat: 'Saturday', saturday: 'Saturday', saturdays: 'Saturday',
  sun: 'Sunday', sunday: 'Sunday', sundays: 'Sunday',
};

function normalizePreferredDeliveryDays(value: unknown): string {
  const selected = new Set<(typeof LEGACY_WEEKDAY_COLUMNS)[number]>();
  const tokens = Array.isArray(value) ? value.map(String) : String(value ?? '').split(/[,;|/]+/);
  for (const token of tokens) {
    const key = token.trim().toLowerCase().replace(/[^a-z]/g, '');
    const day = PREFERRED_DELIVERY_DAY_ALIASES[key];
    if (day) selected.add(day);
  }
  return LEGACY_WEEKDAY_COLUMNS.filter((day) => selected.has(day)).join(', ');
}

const buyerSynonyms: { [key: string]: string[] } = {
  'ID': ['id', 'buyer id', 'kode', 'kode buyer'],
  'Store Name': ['store name', 'toko', 'nama toko', 'buyer name', 'name'],
  'Owner': ['owner', 'pemilik', 'owner name', 'nama owner'],
  'Phone': ['phone', 'no hp', 'no telepon', 'telepon', 'phone number', 'no telp'],
  'Email': ['email', 'e-mail', 'mail'],
  'Address': ['address', 'alamat', 'alamat toko', 'store address'],
  'Main Channel': ['main channel', 'business type', 'businessType', 'tipe bisnis', 'jenis usaha', 'type'],
  'Sub-channel': ['sub-channel', 'sub channel', 'subchannel', 'sub channel'],
  'Outlet Specifics': ['outlet specifics', 'outlet examples', 'outlet example', 'contoh outlet'],
  'Status': ['status', 'buyer status'],
  'Created At': ['created at', 'tanggal dibuat', 'created'],
  'Preferred Delivery Days': ['preferred delivery days', 'preferred days', 'delivery days', 'hari pengiriman'],
  'Last Order Date': ['last order date', 'last shipment', 'pengiriman terakhir', 'last delivery'],
  'Last Visit Date': ['last visit date', 'last visit', 'kunjungan terakhir'],
  'Shipment Success': ['shipment success', 'success rate', 'shipment rate'],
  'Notes': ['notes', 'catatan', 'tags'],
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
  'Preferred Delivery Days': ['preferred delivery days', 'preferred days', 'delivery days', 'hari pengiriman'],
  'Last Supplied Date': ['last supplied date', 'last delivery', 'pengiriman terakhir', 'last shipment'],
  'Delivery Success': ['delivery success', 'success rate', 'delivery rate'],
  'Notes': ['notes', 'catatan', 'tags'],
};

function cellToImportText(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return value != null ? String(value) : '';
}

const BUYER_EXAMPLE_ROWS = [
  ['', 'Warung Indah', 'Yohan', '+62 81200000001', 'yohan@example.com', 'Jl. Melati 21, Jakarta', 'Retail GT', 'Retail', 'Toko kelontong', 'Active', '2026-11-01', 'Monday, Wednesday, Friday', '2026-11-20', '2026-11-27', '98', 'Priority account'],
  ['', 'Indomaret Senayan', 'Sari', '+62 81200000002', 'sari@example.com', 'Jl. Senayan 4, Jakarta', 'Retail MT', 'Minimarket', 'Indomaret', 'Active', '2026-11-02', 'Tuesday, Thursday', '2026-11-18', '2026-11-25', '95', 'Weekly delivery'],
  ['', 'Kantin Sejahtera', 'Budi', '+62 81200000003', 'budi@example.com', 'Jl. Sudirman 10, Jakarta', 'Retail GT', 'Kantin', 'Kantin kantor', 'Prospect', '2026-11-03', 'Monday, Friday', '', '', '', ''],
];

const SUPPLIER_EXAMPLE_ROWS = [
  ['', 'Sumber Rasa', 'Andi', '+62 81100000001', 'andi@example.com', 'Manufacturer', 'Jl. Industri 8, Bekasi', 'Active', '2026-11-01', 'Monday, Thursday', '2026-11-15', '97', 'Primary supplier'],
  ['', 'Laut Biru Foods', 'Dewi', '+62 81100000002', 'dewi@example.com', 'Distributor', 'Jl. Pelabuhan 2, Surabaya', 'Active', '2026-11-04', 'Wednesday', '2026-11-19', '94', ''],
  ['', 'Gudang Timur', 'Raka', '+62 81100000003', 'raka@example.com', 'Wholesaler', 'Jl. Pergudangan 5, Tangerang', 'Inactive', '2026-11-06', 'Tuesday, Friday', '', '', 'New supplier'],
];

function generateBuyerId() {
  return 'LKB-' + Math.floor(10000000 + Math.random() * 90000000).toString();
}
function generateSupplierId() {
  return 'LKS-' + Math.floor(10000000 + Math.random() * 90000000).toString();
}

/** Drop blank Excel trailing rows (used-range padding) so preview count matches real data. */
function isNonEmptyRow(row: ImportRow) {
  return Object.values(row).some((v) => String(v ?? '').trim() !== '');
}

export default function ImportData({ open, onCloseAction, onImportAction, type = 'Buyers' }: ImportDataProps) {
  const { tImport, tShared } = useClientsTranslations();

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
  const importColumnGuides: ImportColumnGuide[] = fields.map((field) => ({
    name: field.key,
    required: field.key === (type === 'Buyers' ? 'Store Name' : 'Supplier Name'),
    description: tImport(`master.${type === 'Buyers' ? 'buyer' : 'supplier'}.columns.${field.labelKey}`),
  }));
  const getFieldLabel = (labelKey: string): string =>
    type === 'Buyers'
      ? tImport(`buyerFields.${labelKey}`)
      : tImport(`supplierFields.${labelKey}`);

  // Automap columns to fields using synonyms
  function getAutomap(fileHeaders: string[]) {
    const mapping: { [key: string]: string } = {};
    fields.forEach((field: MasterImportField) => {
      const syns = [field.key, ...(synonyms[field.key] || [])];
      const found = fileHeaders.find((header: string) => syns.some((synonym: string) => synonym.toLowerCase() === header.trim().toLowerCase()));
      if (found) mapping[field.key] = found;
    });
    const normalizedHeaders = new Map<string, string>(fileHeaders.map((header: string): [string, string] => [header.trim().toLowerCase(), header]));
    LEGACY_WEEKDAY_COLUMNS.forEach((day) => {
      const found = LEGACY_WEEKDAY_HEADERS[day]
        .map((header) => normalizedHeaders.get(header.toLowerCase()))
        .find((header): header is string => Boolean(header));
      if (found) mapping[`__weekday_${day}`] = found;
    });
    return mapping;
  }

  const handleFile = (file?: File) => {
    setError('');
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError('File is larger than 10 MB.'); return; }
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext || '')) { setError('Choose an Excel (.xlsx, .xls) or CSV file.'); return; }
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = (evt: ProgressEvent<FileReader>) => {
      try {
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
        workbook = XLSX.read(data, { type: 'array', cellDates: true });
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
      const headers = fileHeadersRow.filter(Boolean);
      if (new Set(headers.map((header) => header.toLowerCase())).size !== headers.length) {
        setError('The file contains duplicate column headers. Rename duplicate headers and upload again.');
        return;
      }
      const dataRows = json
        .slice(1)
        .map((row: unknown[]): ImportRow => {
          const cells = Array.isArray(row) ? row : [];
          const obj: Record<string, string> = {};
          fileHeadersRow.forEach((h, i) => {
            if (!h) return;
            obj[h] = cellToImportText(cells[i]);
          });
          return obj as ImportRow;
        })
        .filter(isNonEmptyRow);
      if (dataRows.length === 0) { setError('The file has headers but no data rows.'); return; }
      // Keep unknown headers available for manual mapping. Required-field checks run
      // after the user maps columns, before the preview step.
      const autoMapping = getAutomap(headers);
      setFileHeaders(headers);
      setRows(dataRows);
      setSelectedRowIndices(new Set(dataRows.map((_, index) => index)));
      setMapping(autoMapping);
      setStep(1); // mapping step
      } catch { setError('The file could not be read. Check that it is a valid Excel or CSV file.'); }
    };
    reader.onerror = () => setError('The file could not be read. Check the file and try again.');
    if (ext === 'csv') reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  };

  // Stable mapped rows for preview + import. The new format stores each
  // weekday in its own column; legacy combined weekday columns remain readable.
  const mappedRows = useMemo(() => {
    return rows.map((row: ImportRow) => {
      const mapped: Record<string, string> = {};
      fields.forEach((f: MasterImportField) => {
        const col = mapping[f.key];
        mapped[f.key] = col ? String(row[col] ?? '') : '';
      });
      const directPreferredDays = mapped['Preferred Delivery Days'] || '';
      const legacySevenDayFlags = LEGACY_WEEKDAY_COLUMNS.filter((day) => {
        const header = mapping[`__weekday_${day}`];
        const cell = header ? String(row[header] ?? '').trim().toLowerCase() : '';
        return ['yes', 'y', 'true', '1', 'x'].includes(cell);
      });
      mapped.preferredDays = normalizePreferredDeliveryDays(directPreferredDays || legacySevenDayFlags);
      mapped['Preferred Delivery Days'] = mapped.preferredDays;
      if (type === 'Buyers') mapped.ID = generateBuyerId();
      else mapped.ID = generateSupplierId();
      return mapped as ImportRow;
    });
  }, [rows, mapping, type, fields]);

  const handleContinueToPreview = () => {
    const mappingErrors = getDuplicateImportMappingErrors(
      mapping,
      Object.fromEntries(fields.map((field: MasterImportField) => [field.key, getFieldLabel(field.labelKey)])),
    );
    if (mappingErrors.length) { setError(mappingErrors.join(' ')); return; }
    const requiredNameField = type === 'Buyers' ? 'Store Name' : 'Supplier Name';
    if (!mapping[requiredNameField]) { setError(`Map the required ${requiredNameField} column before preview.`); return; }
    const invalid = rows.map((row, index) => ({ row, line: index + 2 })).filter(({ row }) => !String(row[mapping[requiredNameField]] || '').trim());
    if (invalid.length) { setError(`Missing ${requiredNameField} in row(s): ${invalid.slice(0, 8).map((item) => item.line).join(', ')}.`); return; }
    setError('');
    setStep(2);
  };

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
        await onImportAction(selectedMappedRows as BuyerImportRow[]);
      } else {
        await onImportAction(selectedMappedRows as SupplierImportRow[]);
      }
      resetState();
      onCloseAction();
    } catch {
      setImporting(false);
      setError(tImport('fileProcessFailed'));
    }
  };

  const handleClose = () => {
    if (importing) return;
    resetState();
    onCloseAction();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl border border-[#e6e6e6] p-4 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden relative">
        <button
          className="absolute top-3 right-3 p-2 rounded-full hover:bg-gray-100 disabled:opacity-50"
          onClick={handleClose}
          disabled={importing}
        >
          <X className="w-5 h-5 text-black" />
        </button>
        <h2 className="shrink-0 text-xl font-bold text-black mb-4 border-b border-[#e6e6e6] pb-2 flex items-center gap-2">
          <FileText className="w-5 h-5 text-[#0a61d7]" /> {type === 'Buyers' ? tImport('titleBuyers') : tImport('titleSuppliers')}
        </h2>
        <div className="flex-1 min-h-0 overflow-y-auto">
        {step === 0 && (
          <ImportStartPanel
            title={tImport(type === 'Buyers' ? 'master.buyer.title' : 'master.supplier.title')}
            overview={tImport(type === 'Buyers' ? 'master.buyer.overview' : 'master.supplier.overview')}
            instructions={[0, 1, 2, 3].map((index) =>
              tImport(`master.${type === 'Buyers' ? 'buyer' : 'supplier'}.instruction${index}`))}
            columns={importColumnGuides}
            exampleRows={type === 'Buyers' ? BUYER_EXAMPLE_ROWS : SUPPLIER_EXAMPLE_ROWS}
            exampleHint={tImport(type === 'Buyers' ? 'exampleBuyerHint' : 'exampleSupplierHint')}
            templateName={type === 'Buyers' ? 'Lakupak_Buyer_Template.xlsx' : 'Lakupak_Supplier_Template.xlsx'}
            onFileSelectedAction={handleFile}
            error={error}
            filename={filename}
          />
        )}
        {step === 1 && (
          <div className="flex flex-col gap-1">
            {error ? <div className="mb-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">{error}</div> : null}
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
            <div className="sticky bottom-0 z-20 flex justify-end gap-2 mt-2 bg-white text-sm border-t border-gray-200 pt-4">
              <button type="button" className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200" onClick={() => { setStep(0); setRows([]); setFilename(''); setFileHeaders([]); setMapping({}); }}>{tImport('back')}</button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-[#0a61d7] text-white font-semibold hover:bg-[#084ba6] flex items-center gap-2"
                onClick={() => {
                  handleContinueToPreview();
                  setPreviewPage(1);
                  setSelectedRowIndices(new Set(rows.map((_, index) => index)));
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
            <div className="sticky bottom-0 z-20 flex justify-end gap-2 mt-2 bg-white text-sm border-t border-gray-200 pt-4">
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
    </div>
  );
}

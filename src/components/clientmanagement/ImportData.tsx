import React, { useRef, useState } from 'react';
import { Upload, X, FileText, Eye, CheckCircle2, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { OrderDetail, SupplyDetail } from '@/types/client';

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
  onImport: (data: BuyerImportRow[] | SupplierImportRow[]) => void;
  type?: ImportType;
};

type ImportRow = BuyerImportRow | SupplierImportRow;

function parseOrderDetails(cell: string | undefined): OrderDetail[] {
  if (!cell) return [];
  try {
    return JSON.parse(cell);
  } catch {
    return [];
  }
}
function parseSupplies(cell: string | undefined): SupplyDetail[] {
  if (!cell) return [];
  try {
    return JSON.parse(cell);
  } catch {
    return [];
  }
}

// Add mapping state and helpers
const buyerFields = [
  { key: 'ID', label: 'ID (Optional)' },
  { key: 'Store Name', label: 'Store Name (Optional)' },
  { key: 'Owner', label: 'Owner (Optional)' },
  { key: 'Phone', label: 'Phone (Optional)' },
  { key: 'Email', label: 'Email (Optional)' },
  { key: 'Address', label: 'Address (Optional)' },
  { key: 'Business Type', label: 'Business Type (Optional)' },
  { key: 'Status', label: 'Status (Optional)' },
  { key: 'Created At', label: 'Created At (Optional)' },
  { key: 'Preferred Delivery Days', label: 'Preferred Delivery Days (Optional)' },
  { key: 'Last Shipment', label: 'Last Shipment (Optional)' },
  { key: 'Shipment Success', label: 'Shipment Success (Optional)' },
  { key: 'Notes', label: 'Notes (Optional)' },
  { key: 'Order Details', label: 'Order Details (Optional)' },
];
const supplierFields = [
  { key: 'ID', label: 'ID (Optional)' },
  { key: 'Supplier Name', label: 'Supplier Name (Optional)' },
  { key: 'Contact', label: 'Contact Person (Optional)' },
  { key: 'Phone', label: 'Phone (Optional)' },
  { key: 'Email', label: 'Email (Optional)' },
  { key: 'Business Type', label: 'Business Type (Optional)' },
  { key: 'Address', label: 'Address (Optional)' },
  { key: 'Status', label: 'Status (Optional)' },
  { key: 'Created At', label: 'Created At (Optional)' },
  { key: 'Preferred Delivery Days', label: 'Preferred Delivery Days (Optional)' },
  { key: 'Last Delivery', label: 'Last Delivery (Optional)' },
  { key: 'Delivery Success', label: 'Delivery Success (Optional)' },
  { key: 'Notes', label: 'Notes (Optional)' },
  { key: 'Supplies', label: 'Supplies (Optional)' },
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

export default function ImportData({ open, onClose, onImport, type = 'Buyers' }: ImportDataProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<number>(0); // 0: upload, 1: mapping, 2: preview
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [error, setError] = useState<string>('');
  const [filename, setFilename] = useState<string>('');
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<{ [key: string]: string }>({});

  const fields = type === 'Buyers' ? buyerFields : supplierFields;
  const synonyms = type === 'Buyers' ? buyerSynonyms : supplierSynonyms;
  const headers = fields.map(f => f.key);

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
        setError('File read error.');
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
      const json = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
      if (!json.length) {
        setError('File is empty or invalid.');
        return;
      }
      const fileHeadersRow = (json[0] as string[]).map(h => h.trim());
      setFileHeaders(fileHeadersRow);
      setRows(json.slice(1).map((row: string[]): ImportRow => {
        const obj: Record<string, string> = {};
        fileHeadersRow.forEach((h, i) => {
          obj[h] = row[i] ?? '';
        });
        return obj as ImportRow;
      }));
      setMapping(getAutomap(fileHeadersRow));
      setStep(1); // mapping step
    };
    if (ext === 'csv') {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  };

  // Map rows to required fields using mapping
  const getMappedRows = () => {
    return rows.map((row: ImportRow) => {
      const mapped: Partial<BuyerImportRow | SupplierImportRow> = {};
      fields.forEach(f => {
        const col = mapping[f.key];
        mapped[f.key as keyof (BuyerImportRow | SupplierImportRow)] = col ? row[col] : '';
      });
      if (type === 'Buyers') {
        mapped.ID = generateBuyerId();
        mapped.orderDetails = parseOrderDetails(mapped['Order Details'] as string);
      } else {
        mapped.ID = generateSupplierId();
        mapped.supplies = parseSupplies(mapped['Supplies'] as string);
      }
      return mapped;
    });
  };

  const handleImport = () => {
    const mappedRows = getMappedRows();
    if (onImport) {
      if (type === 'Buyers') {
        onImport(mappedRows as BuyerImportRow[]);
      } else {
        onImport(mappedRows as SupplierImportRow[]);
      }
    }
    setRows([]);
    setStep(0);
    setFilename('');
    setFileHeaders([]);
    setMapping({});
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl p-4 w-full max-w-3xl relative">
        <button className="absolute top-3 right-3 p-2 rounded-full hover:bg-gray-100" onClick={onClose}><X className="w-5 h-5 text-black" /></button>
        <h2 className="text-xl font-bold text-black mb-4 border-b border-gray-200 pb-2 flex items-center gap-2">
          <FileText className="w-5 h-5 text-[#0a61d7]" /> Import {type} Data
        </h2>
        {step === 0 && (
          <div className="flex flex-col items-center justify-center gap-4 py-8">
            <input type="file" accept=".xlsx,.xls,.csv" ref={inputRef} className="hidden" onChange={handleFile} />
            <button type="button" className="flex flex-col items-center gap-2 px-6 py-4 rounded-lg border-2 border-dashed border-[#0a61d7] bg-[#f7faff] hover:bg-[#e6f0ff] transition" onClick={() => inputRef.current && inputRef.current.click()}>
              <Upload className="w-8 h-8 text-[#0a61d7]" />
              <span className="text-[#0a61d7] font-semibold">Click to upload .xlsx or .csv file</span>
              {filename && <span className="text-xs text-gray-500">{filename}</span>}
            </button>
            {error && <div className="flex items-center gap-2 text-red-500 text-sm"><AlertTriangle className="w-4 h-4" /> {error}</div>}
          </div>
        )}
        {step === 1 && (
          <div className="flex flex-col gap-1 max-h-[550px] overflow-y-auto">
            <div className="mb-2 font-semibold text-black">Map your columns to the fields (all fields are optional):</div>
            <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-blue-700 text-sm">
                💡 <strong>Flexible Import:</strong> You can map any columns you have. Unmapped fields will remain blank. 
                Import whatever data you have available!
              </p>
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white p-2">
              <table className="min-w-full text-xs font-medium text-left">
                <thead>
                  <tr className="text-gray-500 bg-gray-100 whitespace-nowrap">
                    <th className="py-2 px-3 font-medium uppercase">Field</th>
                    <th className="py-2 px-3 font-medium uppercase">Map to Column</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map(f => (
                    <tr key={f.key} className="whitespace-nowrap">
                      <td className="py-1 px-3 font-semibold text-black">{f.label}</td>
                      <td className="py-1 px-3">
                        <select
                          className="w-full border border-gray-200 rounded px-2 py-1 text-black text-xs"
                          value={mapping[f.key] || ''}
                          onChange={e => setMapping(m => ({ ...m, [f.key]: e.target.value }))}
                        >
                          <option value="">-- Not Mapped --</option>
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
              <button type="button" className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200" onClick={() => { setStep(0); setRows([]); setFilename(''); setFileHeaders([]); setMapping({}); }}>Back</button>
              <button type="button" className="px-4 py-2 rounded-lg bg-[#0a61d7] text-white font-semibold hover:bg-[#084ba6] flex items-center gap-2" onClick={() => setStep(2)}>Preview</button>
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 mb-2 text-black">
              <Eye className="w-4 h-4 text-[#0a61d7]" /> Preview {rows.length} {type.toLowerCase()} to import
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full text-xs font-medium text-left bg-white">
                <thead>
                  <tr className="text-gray-500 bg-gray-100 whitespace-nowrap">
                    {fields.map(f => <th key={f.key} className="py-2 px-3 font-medium uppercase">{f.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {getMappedRows().map((row, idx) => (
                    <tr key={idx} className="whitespace-nowrap text-black">
                      {fields.map(f => <td key={f.key} className="py-2 px-3">{
                        (() => {
                          const value = row[f.key as keyof typeof row];
                          if (typeof value === 'string') return value;
                          if (Array.isArray(value)) return JSON.stringify(value);
                          return String(value || '');
                        })()
                      }</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2 mt-4 text-sm border-t border-gray-200 pt-4">
              <button type="button" className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200" onClick={() => setStep(1)}>Back</button>
              <button type="button" className="px-4 py-2 rounded-lg bg-[#0a61d7] text-white font-semibold hover:bg-[#084ba6] flex items-center gap-2" onClick={handleImport}><CheckCircle2 className="w-4 h-4" /> Import</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

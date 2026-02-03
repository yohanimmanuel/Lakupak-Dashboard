import React, { useRef, useState } from 'react';
import { Upload, X, FileText, Eye, CheckCircle2, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { OrderDetail } from '@/types/client';

const orderFields = [
  { key: 'product', label: 'Product Name' },
  { key: 'totalOrders', label: 'Total Orders (Boxes)' },
  { key: 'totalSpend', label: 'Total Spend' },
  { key: 'lastOrderDate', label: 'Last Order Date' },
  { key: 'outstanding', label: 'Outstanding' },
];

const orderFieldSynonyms: { [key: string]: string[] } = {
  product: ['product', 'product name', 'nama produk'],
  totalOrders: ['total orders', 'orders', 'boxes', 'jumlah', 'jumlah box'],
  totalSpend: ['total spend', 'spend', 'total', 'total harga', 'harga'],
  lastOrderDate: ['last order date', 'order date', 'tanggal', 'tanggal order'],
  outstanding: ['outstanding', 'piutang', 'utang'],
};

function getAutomap(fileHeaders: string[]) {
  const mapping: { [key: string]: string } = {};
  orderFields.forEach(f => {
    const syns = [f.label, f.key, ...(orderFieldSynonyms[f.key] || [])];
    const found = fileHeaders.find(h => syns.some(s => s.toLowerCase() === h.trim().toLowerCase()));
    if (found) mapping[f.key] = found;
  });
  return mapping;
}

// Remove currency identifier function - strips currency symbols/codes, preserves numeric values
function removeCurrencyIdentifier(value: string | undefined): string {
  if (!value) return '';
  
  const valueStr = value.toString().trim();
  if (!valueStr) return '';
  
  // Extract the numeric part while preserving original formatting (commas, dots, etc.)
  // Remove any currency prefix/symbol but keep the number format exactly as is
  const match = valueStr.match(/^[^\d]*(.+)$/);
  if (!match) return valueStr; // Return original if no pattern found
  
  const numericPart = match[1].trim();
  if (!numericPart) return valueStr; // Return original if no numbers found
  
  // Return only the numeric part without any currency identifier
  return numericPart;
}

export default function ImportOrdersModal({ open, onClose, onImport }: { open: boolean, onClose: () => void, onImport: (orderDetails: OrderDetail[]) => void }) {
  
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0); // 0: upload, 1: mapping, 2: preview
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [error, setError] = useState('');
  const [filename, setFilename] = useState('');
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<{ [key: string]: string }>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  if (!open) return null;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError('');
    setValidationErrors([]);
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    
    // File size validation (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('File size must be less than 5MB.');
      return;
    }
    
    // File type validation
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
      setError('Please upload a valid Excel (.xlsx, .xls) or CSV file.');
      return;
    }
    
    setFilename(file.name);
    setIsProcessing(true);
    
    const reader = new FileReader();
    reader.onload = (evt: ProgressEvent<FileReader>) => {
      try {
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
        const json = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
        
        if (!json.length) {
          setError('File is empty or invalid.');
          return;
        }
        
        // Validate minimum required rows (header + at least 1 data row)
        if (json.length < 2) {
          setError('File must contain at least one data row.');
          return;
        }
        
        const fileHeadersRow = (json[0] as string[]).map(h => h.trim()).filter(h => h);
        if (fileHeadersRow.length === 0) {
          setError('File must contain valid column headers.');
          return;
        }
        
        setFileHeaders(fileHeadersRow);
        setRows(json.slice(1).map((row: unknown[]): Record<string, string> => {
          const obj: Record<string, string> = {};
          fileHeadersRow.forEach((h, i) => {
            obj[h] = String(row[i] ?? '');
          });
          return obj;
        }));
        setMapping(getAutomap(fileHeadersRow));
        setStep(1); // mapping step
      } catch {
        setError('Failed to process file. Please ensure it\'s a valid Excel or CSV file.');
      } finally {
        setIsProcessing(false);
      }
    };
    
    reader.onerror = () => {
      setError('Failed to read file.');
      setIsProcessing(false);
    };
    
    if (ext === 'csv') {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  };

  const getMappedRows = () => {
    return rows.map((row: Record<string, string>) => {
      const mapped: Partial<OrderDetail> = {};
      orderFields.forEach(f => {
        const col = mapping[f.key];
        let value: string | undefined = col ? row[col] : '';
        
        // Remove currency identifier for monetary fields
        if (f.key === 'totalSpend' || f.key === 'outstanding') {
          value = removeCurrencyIdentifier(value);
        }
        
        mapped[f.key as keyof OrderDetail] = value as never;
      });
      return mapped as OrderDetail;
    });
  };

  const validateMappedData = (mappedRows: OrderDetail[]) => {
    const errors: string[] = [];
    
    // Only validate that we have at least some data to import
    if (mappedRows.length === 0) {
      errors.push('No data found to import');
      return errors;
    }
    
    // Check if at least one field is mapped
    const hasAnyMapping = Object.keys(mapping).some(key => mapping[key]);
    if (!hasAnyMapping) {
      errors.push('Please map at least one column to a field');
      return errors;
    }
    
    return errors;
  };

  const handleImport = () => {
    const mappedRows = getMappedRows();
    
    // Validate mapped data
    const errors = validateMappedData(mappedRows);
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }
    
    setValidationErrors([]);
    onImport(mappedRows);
    setRows([]);
    setStep(0);
    setFilename('');
    setFileHeaders([]);
    setMapping({});
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl border border-[#e6e6e6] p-4 w-full max-w-3xl relative">
        <button className="absolute top-3 right-3 p-2 rounded-full hover:bg-gray-100" onClick={onClose}><X className="w-5 h-5 text-black" /></button>
        <h2 className="text-xl font-bold text-black mb-4 border-b border-[#e6e6e6] pb-2 flex items-center gap-2">
          <FileText className="w-5 h-5 text-[#0a61d7]" /> Import Order Details
        </h2>
        {step === 0 && (
          <div className="flex flex-col items-center justify-center gap-4 py-8">
            <input type="file" accept=".xlsx,.xls,.csv" ref={inputRef} className="hidden" onChange={handleFile} />
            <button 
              type="button" 
              className="flex flex-col items-center gap-2 px-6 py-4 rounded-lg border-2 border-dashed border-[#0a61d7] bg-[#f7faff] hover:bg-[#e6f0ff] transition disabled:opacity-50" 
              onClick={() => inputRef.current && inputRef.current.click()}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <div className="w-8 h-8 border-2 border-[#0a61d7] border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <Upload className="w-8 h-8 text-[#0a61d7]" />
              )}
              <span className="text-[#0a61d7] font-semibold">
                {isProcessing ? 'Processing file...' : 'Click to upload .xlsx or .csv file'}
              </span>
              {filename && <span className="text-xs text-gray-500">{filename}</span>}
            </button>
            {error && <div className="flex items-center gap-2 text-red-500 text-sm"><AlertTriangle className="w-4 h-4" /> {error}</div>}
          </div>
        )}
        {step === 1 && (
          <div className="flex flex-col gap-1 max-h-[550px] overflow-y-auto">
            <div className="mb-2 font-semibold text-black">Map your columns to the required fields:</div>
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white p-2">
              <table className="min-w-full text-xs font-medium text-left">
                <thead>
                  <tr className="text-gray-500 bg-gray-100 whitespace-nowrap">
                    <th className="py-2 px-3 font-medium uppercase">Field</th>
                    <th className="py-2 px-3 font-medium uppercase">Map to Column</th>
                  </tr>
                </thead>
                <tbody>
                  {orderFields.map(f => (
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
              <button type="button" className="px-4 py-2 rounded-lg bg-[#0a61d7] text-white font-semibold hover:bg-[#084ba6] flex items-center gap-2" onClick={() => setStep(2)} disabled={Object.keys(mapping).filter(k => mapping[k]).length === 0}>Preview</button>
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 mb-2 text-black">
              <Eye className="w-4 h-4 text-[#0a61d7]" /> Preview {getMappedRows().length} orders to import
            </div>
            
            {/* Validation Errors */}
            {validationErrors.length > 0 && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="text-red-700 text-sm font-medium mb-2">Please fix the following errors:</div>
                <ul className="text-red-600 text-xs space-y-1">
                  {validationErrors.map((error, index) => (
                    <li key={index}>• {error}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full text-xs font-medium text-left bg-white">
                <thead>
                  <tr className="text-gray-500 bg-gray-100 whitespace-nowrap">
                    {orderFields.map(f => <th key={f.key} className="py-2 px-3 font-medium uppercase">{f.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {getMappedRows().map((row, idx) => (
                    <tr key={idx} className="whitespace-nowrap text-black">
                      {orderFields.map(f => <td key={f.key} className="py-2 px-3">{row[f.key as keyof OrderDetail]}</td>)}
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

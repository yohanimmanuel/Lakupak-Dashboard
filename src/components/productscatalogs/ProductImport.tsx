'use client';
import React, { useRef, useState } from 'react';
import { Upload, X, FileText, Eye, CheckCircle2, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { ProductImportRow } from '@/types/product';
import { useProductsTranslations } from '@/hooks/useProductsTranslations';

type ProductImportProps = {
  open: boolean;
  onCloseAction: () => void;
  onImportAction: (data: ProductImportRow[]) => void;
};

const productFields = [
  { key: 'Product ID', slug: 'productId' },
  { key: 'SKU', slug: 'sku' },
  { key: 'Product Name', slug: 'productName' },
  { key: 'Description', slug: 'description' },
  { key: 'Product Type', slug: 'productType' },
  { key: 'Brand', slug: 'brand' },
  { key: 'Supplier', slug: 'supplier' },
  { key: 'Purchase Price', slug: 'purchasePrice' },
  { key: 'Selling Price', slug: 'sellingPrice' },
  { key: 'Status', slug: 'status' },
  { key: 'Product Category', slug: 'productCategory' },
  { key: 'Catalog Name', slug: 'catalogName' },
];

// Synonyms for automapping
const productSynonyms: { [key: string]: string[] } = {
  'Product ID': ['id', 'product id', 'kode', 'kode produk', 'product code'],
  'SKU': ['sku', 'stock keeping unit', 'kode barang'],
  'Product Name': ['name', 'product name', 'nama produk', 'nama barang', 'title'],
  'Description': ['description', 'desc', 'deskripsi', 'detail', 'product description'],
  'Product Type': ['category', 'kategori', 'jenis', 'type', 'product type'],
  'Brand': ['brand', 'merek', 'brand name'],
  'Supplier': ['supplier', 'vendor', 'pemasok', 'supplier name'],
  // Stock fields removed - now handled at variant level
  'Purchase Price': ['purchase price', 'buy price', 'cost', 'harga beli', 'harga modal'],
  'Selling Price': ['selling price', 'sell price', 'price', 'harga jual', 'harga'],
  'Status': ['status', 'product status', 'state'],
  'Product Category': ['catalog type', 'catalog', 'type', 'jenis katalog', 'category'],
  'Catalog Name': ['catalog name', 'catalog', 'nama katalog'],
  
  
};

function generateProductId() {
  return 'LKP-' + Math.floor(10000000 + Math.random() * 90000000).toString();
}

export default function ProductImport({ open, onCloseAction, onImportAction }: ProductImportProps) {
  const { tImport } = useProductsTranslations();
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<number>(0); // 0: upload, 1: mapping, 2: preview
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [error, setError] = useState<string>('');
  const [filename, setFilename] = useState<string>('');
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<{ [key: string]: string }>({});

  const getFieldLabel = (slug: string) => tImport(`productFields.${slug}` as Parameters<typeof tImport>[0]);

  const headers = productFields.map(f => f.key);

  // Automap columns to fields using synonyms
  function getAutomap(fileHeaders: string[]) {
    const mapping: { [key: string]: string } = {};
    productFields.forEach(f => {
      const syns = [f.key, ...(productSynonyms[f.key] || [])];
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
            const json = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];
      if (!json.length) {
        setError(tImport('fileEmpty'));
        return;
      }
      const fileHeadersRow = json[0].map(h => h.trim());
      setFileHeaders(fileHeadersRow);
      setRows(json.slice(1).map((row: string[]) => {
        const obj: Record<string, string> = {};
        fileHeadersRow.forEach((h, i) => {
          obj[h] = row[i] ?? '';
        });
        return obj;
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
  const getMappedRows = (): ProductImportRow[] => {
    return rows.map((row: Record<string, string>): ProductImportRow => {
      const mapped: Partial<ProductImportRow> = {};
      productFields.forEach(f => {
        const col = mapping[f.key];
        mapped[f.key as keyof ProductImportRow] = col ? row[col] : '';
      });
      
      // Always overwrite Product ID with LKP format (Laku standard)
      mapped['Product ID'] = generateProductId();
      // Set default values for required fields
      mapped['Status'] = 'Draft'; // Always set status to Draft for imported products
      
      // Calculate stock status dynamically based on stock quantity and threshold
      // Stock calculation removed - now handled at variant level
      
      if (!mapped['Product Category']) {
        mapped['Product Category'] = '';
      }
      
      if (!mapped['Low Stock Threshold']) {
        mapped['Low Stock Threshold'] = '30';
      }
      
      return mapped as ProductImportRow;
    });
  };

  const handleImport = () => {
    const mappedRows = getMappedRows();
    if (onImportAction) {
      onImportAction(mappedRows);
    }
    setRows([]);
    setStep(0);
    setFilename('');
    setFileHeaders([]);
    setMapping({});
    onCloseAction();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl border border-[#e6e6e6] p-4 w-full max-w-5xl relative">
        <button className="absolute top-3 right-3 p-2 rounded-full hover:bg-gray-100" onClick={onCloseAction}>
          <X className="w-5 h-5 text-black" />
        </button>
        <h2 className="text-xl font-bold text-black mb-4 border-b border-gray-200 pb-2 flex items-center gap-2">
          <FileText className="w-5 h-5 text-[#0a61d7]" /> {tImport('title')}
        </h2>
        
        {step === 0 && (
          <div className="flex flex-col items-center justify-center gap-4 py-8">
            <input type="file" accept=".xlsx,.xls,.csv" ref={inputRef} className="hidden" onChange={handleFile} />
            <button 
              type="button" 
              className="flex flex-col items-center gap-2 px-6 py-4 rounded-lg border-2 border-dashed border-[#0a61d7] bg-[#f7faff] hover:bg-[#e6f0ff] transition" 
              onClick={() => inputRef.current && inputRef.current.click()}
            >
              <Upload className="w-8 h-8 text-[#0a61d7]" />
              <span className="text-[#0a61d7] font-semibold">{tImport('upload')}</span>
              {filename && <span className="text-xs text-gray-500">{filename}</span>}
            </button>
            {error && <div className="flex items-center gap-2 text-red-500 text-sm">
              <AlertTriangle className="w-4 h-4" /> {error}
            </div>}
          </div>
        )}
        
        {step === 1 && (
          <div className="flex flex-col gap-1 max-h-[550px] overflow-y-auto">
            <div className="mb-2 font-semibold text-black">{tImport('mapColumnsOptional')}</div>
            <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-blue-700 text-sm">
                💡 <strong>{tImport('flexibleImport')}</strong> {tImport('flexibleImportHint')}
              </p>
            </div>
            <div className="overflow-x-auto rounded-lg border border-[#e6e6e6] bg-white p-2">
              <table className="min-w-full text-xs font-medium text-left">
                <thead>
                  <tr className="text-gray-500 bg-gray-100 whitespace-nowrap">
                    <th className="py-2 px-3 font-medium uppercase">{tImport('field')}</th>
                    <th className="py-2 px-3 font-medium uppercase">{tImport('mapToColumn')}</th>
                  </tr>
                </thead>
                <tbody>
                  {productFields.map(f => (
                    <tr key={f.key} className="whitespace-nowrap">
                      <td className="py-1 px-3 font-semibold text-black">{getFieldLabel(f.slug)}</td>
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
            <div className="flex justify-end gap-2 mt-2 text-sm border-t border-[#e6e6e6] pt-4">
              <button 
                type="button" 
                className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200" 
                onClick={() => { 
                  setStep(0); 
                  setRows([]); 
                  setFilename(''); 
                  setFileHeaders([]); 
                  setMapping({}); 
                }}
              >
                {tImport('back')}
              </button>
              <button 
                type="button" 
                className="px-4 py-2 rounded-lg bg-[#0a61d7] text-white font-semibold hover:bg-[#084ba6] flex items-center gap-2" 
                onClick={() => setStep(2)} 
                disabled={Object.keys(mapping).filter(k => mapping[k]).length === 0}
              >
                {tImport('preview')}
              </button>
            </div>
          </div>
        )}
        
        {step === 2 && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 mb-2 text-black">
              <Eye className="w-4 h-4 text-[#0a61d7]" /> {tImport('previewProducts', { count: rows.length })}
            </div>
            <div className="overflow-x-auto rounded-lg border border-[#e6e6e6]">
              <table className="min-w-full text-xs font-medium text-left bg-white">
                <thead>
                  <tr className="text-gray-500 bg-gray-100 whitespace-nowrap">
                    {productFields.map(f => <th key={f.key} className="py-2 px-3 font-medium uppercase">{getFieldLabel(f.slug)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {getMappedRows().map((row, idx) => (
                    <tr key={idx} className="whitespace-nowrap text-black">
                      {productFields.map(f => <td key={f.key} className="py-2 px-3">{
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
            <div className="flex justify-end gap-2 mt-4 text-sm border-t border-[#e6e6e6] pt-4">
              <button 
                type="button" 
                className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200" 
                onClick={() => setStep(1)}
              >
                {tImport('back')}
              </button>
              <button 
                type="button" 
                className="px-4 py-2 rounded-lg bg-[#0a61d7] text-white font-semibold hover:bg-[#084ba6] flex items-center gap-2" 
                onClick={handleImport}
              >
                <CheckCircle2 className="w-4 h-4" /> {tImport('importButton')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

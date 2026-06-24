'use client';
import React, { useRef, useState } from 'react';
import { Upload, X, FileText, Eye, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { ProductImportRow, ProductImportResult } from '@/types/product';
import { useProductsTranslations } from '@/hooks/useProductsTranslations';

type ProductImportProps = {
  open: boolean;
  onCloseAction: () => void;
  onImportAction: (data: ProductImportRow[]) => Promise<ProductImportResult>;
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
  { key: 'Stock Quantity', slug: 'stockQuantity' },
  { key: 'Low Stock Threshold', slug: 'lowStockThreshold' },
  { key: 'MOQ', slug: 'moq' },
  { key: 'Product Category', slug: 'productCategory' },
  { key: 'Catalog Name', slug: 'catalogName' },
];

const productSynonyms: { [key: string]: string[] } = {
  'Product ID': ['id', 'product id', 'kode', 'kode produk', 'product code'],
  'SKU': ['sku', 'stock keeping unit', 'kode barang'],
  'Product Name': ['name', 'product name', 'nama produk', 'nama barang', 'title'],
  'Description': ['description', 'desc', 'deskripsi', 'detail', 'product description'],
  'Product Type': ['category', 'kategori', 'jenis', 'type', 'product type'],
  'Brand': ['brand', 'merek', 'brand name'],
  'Supplier': ['supplier', 'vendor', 'pemasok', 'supplier name'],
  'Purchase Price': ['purchase price', 'buy price', 'cost', 'harga beli', 'harga modal'],
  'Selling Price': ['selling price', 'sell price', 'price', 'harga jual', 'harga'],
  'Stock Quantity': ['stock quantity', 'stock', 'qty', 'quantity', 'jumlah stok', 'stok'],
  'Low Stock Threshold': ['low stock threshold', 'threshold', 'ambang bawah', 'low threshold'],
  'MOQ': ['moq', 'minimum order', 'minimum order quantity', 'pesanan minimum'],
  'Product Category': ['catalog type', 'catalog', 'type', 'jenis katalog', 'category', 'product category', 'sales channel'],
  'Catalog Name': ['catalog name', 'catalog', 'nama katalog'],
};

function generateProductId() {
  return 'LKP-' + Math.floor(10000000 + Math.random() * 90000000).toString();
}

function isNonEmptyRow(row: Record<string, string>) {
  return Object.values(row).some((v) => String(v ?? '').trim() !== '');
}

export default function ProductImport({ open, onCloseAction, onImportAction }: ProductImportProps) {
  const { tImport } = useProductsTranslations();
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<number>(0);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [error, setError] = useState<string>('');
  const [filename, setFilename] = useState<string>('');
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<{ [key: string]: string }>({});
  const [importing, setImporting] = useState(false);

  const getFieldLabel = (slug: string) => tImport(`productFields.${slug}` as Parameters<typeof tImport>[0]);

  function getAutomap(fileHeaders: string[]) {
    const nextMapping: { [key: string]: string } = {};
    productFields.forEach((f) => {
      const syns = [f.key, ...(productSynonyms[f.key] || [])];
      const found = fileHeaders.find((h) => syns.some((s) => s.toLowerCase() === h.trim().toLowerCase()));
      if (found) nextMapping[f.key] = found;
    });
    return nextMapping;
  }

  const resetState = () => {
    setRows([]);
    setStep(0);
    setFilename('');
    setFileHeaders([]);
    setMapping({});
    setError('');
    setImporting(false);
  };

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
      const fileHeadersRow = json[0].map((h) => String(h ?? '').trim());
      const dataRows = json
        .slice(1)
        .map((row: string[]) => {
          const obj: Record<string, string> = {};
          fileHeadersRow.forEach((h, i) => {
            obj[h] = row[i] != null ? String(row[i]) : '';
          });
          return obj;
        })
        .filter(isNonEmptyRow);

      if (dataRows.length === 0) {
        setError(tImport('fileEmpty'));
        return;
      }

      setFileHeaders(fileHeadersRow);
      setRows(dataRows);
      setMapping(getAutomap(fileHeadersRow));
      setStep(1);
    };
    if (ext === 'csv') {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  };

  const getMappedRows = (): ProductImportRow[] => {
    return rows.map((row: Record<string, string>): ProductImportRow => {
      const mapped: Partial<ProductImportRow> = {};
      productFields.forEach((f) => {
        const col = mapping[f.key];
        mapped[f.key as keyof ProductImportRow] = col ? row[col] : '';
      });

      mapped['Product ID'] = generateProductId();
      mapped['Status'] = 'Draft';

      if (!mapped['Product Category']) {
        mapped['Product Category'] = '';
      }
      if (!mapped['Stock Quantity']) {
        mapped['Stock Quantity'] = '0';
      }
      if (!mapped['Low Stock Threshold']) {
        mapped['Low Stock Threshold'] = '30';
      }
      if (!mapped['MOQ']) {
        mapped['MOQ'] = '';
      }

      return mapped as ProductImportRow;
    });
  };

  const handleImport = async () => {
    const mappedRows = getMappedRows();
    setImporting(true);
    setError('');
    try {
      await onImportAction(mappedRows);
      resetState();
      onCloseAction();
    } catch {
      setError(tImport('importError'));
      setImporting(false);
    }
  };

  const draftNotice = (
    <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
      <p className="text-amber-900 text-sm font-medium">{tImport('draftNoticeTitle')}</p>
      <p className="text-amber-800 text-sm mt-1">{tImport('draftNoticeBody')}</p>
      <ul className="text-amber-800 text-xs mt-2 list-disc list-inside space-y-0.5">
        <li>{tImport('manualCompletion.images')}</li>
        <li>{tImport('manualCompletion.variants')}</li>
        <li>{tImport('manualCompletion.details')}</li>
      </ul>
    </div>
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl border border-[#e6e6e6] p-4 w-full max-w-5xl relative max-h-[90vh] overflow-y-auto">
        <button
          className="absolute top-3 right-3 p-2 rounded-full hover:bg-gray-100"
          onClick={() => {
            if (!importing) {
              resetState();
              onCloseAction();
            }
          }}
          disabled={importing}
        >
          <X className="w-5 h-5 text-black" />
        </button>
        <h2 className="text-xl font-bold text-black mb-4 border-b border-gray-200 pb-2 flex items-center gap-2">
          <FileText className="w-5 h-5 text-[#0a61d7]" /> {tImport('title')}
        </h2>

        {step === 0 && (
          <div className="flex flex-col gap-4 py-4">
            {draftNotice}
            <div className="flex flex-col items-center justify-center gap-4">
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
              {error && (
                <div className="flex items-center gap-2 text-red-500 text-sm">
                  <AlertTriangle className="w-4 h-4" /> {error}
                </div>
              )}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-1 max-h-[550px] overflow-y-auto">
            {draftNotice}
            <div className="mb-2 font-semibold text-black">{tImport('mapColumnsOptional')}</div>
            <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-blue-700 text-sm">
                <strong>{tImport('flexibleImport')}</strong> {tImport('flexibleImportHint')}
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
                  {productFields.map((f) => (
                    <tr key={f.key} className="whitespace-nowrap">
                      <td className="py-1 px-3 font-semibold text-black">{getFieldLabel(f.slug)}</td>
                      <td className="py-1 px-3">
                        <select
                          className="w-full border border-gray-200 rounded px-2 py-1 text-black text-xs"
                          value={mapping[f.key] || ''}
                          onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                        >
                          <option value="">{tImport('notMapped')}</option>
                          {fileHeaders.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
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
                disabled={Object.keys(mapping).filter((k) => mapping[k]).length === 0}
              >
                {tImport('preview')}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            {draftNotice}
            <div className="flex items-center gap-2 mb-2 text-black">
              <Eye className="w-4 h-4 text-[#0a61d7]" /> {tImport('previewProducts', { count: rows.length })}
            </div>
            <div className="overflow-x-auto rounded-lg border border-[#e6e6e6]">
              <table className="min-w-full text-xs font-medium text-left bg-white">
                <thead>
                  <tr className="text-gray-500 bg-gray-100 whitespace-nowrap">
                    {productFields.map((f) => (
                      <th key={f.key} className="py-2 px-3 font-medium uppercase">
                        {getFieldLabel(f.slug)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {getMappedRows().map((row, idx) => (
                    <tr key={idx} className="whitespace-nowrap text-black">
                      {productFields.map((f) => (
                        <td key={f.key} className="py-2 px-3">
                          {String(row[f.key as keyof ProductImportRow] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {error && (
              <div className="flex items-center gap-2 text-red-500 text-sm">
                <AlertTriangle className="w-4 h-4" /> {error}
              </div>
            )}
            <div className="flex justify-end gap-2 mt-4 text-sm border-t border-[#e6e6e6] pt-4">
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200"
                onClick={() => setStep(1)}
                disabled={importing}
              >
                {tImport('back')}
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-[#0a61d7] text-white font-semibold hover:bg-[#084ba6] flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                onClick={handleImport}
                disabled={importing}
              >
                {importing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> {tImport('importing')}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" /> {tImport('importButton')}
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

'use client';
import React, { useState } from 'react';
import { X, FileText, Eye, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { ProductImportRow, ProductImportResult } from '@/types/product';
import { useProductsTranslations } from '@/hooks/useProductsTranslations';
import ImportStartPanel, { getDuplicateImportMappingErrors } from '@/components/imports/ImportStartPanel';

type ProductImportProps = {
  open: boolean;
  onCloseAction: () => void;
  onImportAction: (data: ProductImportRow[]) => Promise<ProductImportResult>;
};

const productFields = [
  { key: 'Product Name', slug: 'productName' },
  { key: 'Description', slug: 'description' },
  { key: 'Product Type', slug: 'productType' },
  { key: 'Brand', slug: 'brand' },
  { key: 'Supplier', slug: 'supplier' },
  { key: 'Catalog Name', slug: 'catalogName' },
];

const productSynonyms: { [key: string]: string[] } = {
  'Product Name': ['name', 'product name', 'nama produk', 'nama barang', 'title'],
  'Description': ['description', 'desc', 'deskripsi', 'detail', 'product description'],
  'Product Type': ['category', 'kategori', 'jenis', 'type', 'product type'],
  'Brand': ['brand', 'merek', 'brand name'],
  'Supplier': ['supplier', 'vendor', 'pemasok', 'supplier name'],
  'Catalog Name': ['catalog name', 'nama katalog'],
};

function generateProductId() {
  return 'LKP-' + Math.floor(10000000 + Math.random() * 90000000).toString();
}

function isNonEmptyRow(row: Record<string, string>) {
  return Object.values(row).some((v) => String(v ?? '').trim() !== '');
}

export default function ProductImport({ open, onCloseAction, onImportAction }: ProductImportProps) {
  const { tImport } = useProductsTranslations();
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

  const handleFile = (file?: File) => {
    setError('');
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext || '')) { setError('Choose an Excel (.xlsx, .xls) or CSV file.'); return; }
    if (file.size > 10 * 1024 * 1024) { setError('File is larger than 10 MB.'); return; }
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
        workbook = XLSX.read(data, { type: 'array' });
      }
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];
      if (!json.length) {
        setError(tImport('fileEmpty'));
        return;
      }
      const fileHeadersRow = json[0].map((h) => String(h ?? '').trim());
      if (new Set(fileHeadersRow.filter(Boolean).map((header) => header.toLocaleLowerCase())).size !== fileHeadersRow.filter(Boolean).length) { setError('The file contains duplicate column headers. Rename duplicate headers and upload again.'); return; }
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

      const autoMapping = getAutomap(fileHeadersRow);
      // Keep all source headers so custom distributor column names can be mapped manually.
      setFileHeaders(fileHeadersRow);
      setRows(dataRows);
      setMapping(autoMapping);
      setStep(1);
      } catch { setError('The file could not be read. Check that it is a valid Excel or CSV file.'); }
    };
    reader.onerror = () => setError('The file could not be read.');
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
      mapped['Product Category'] = '';
      mapped['SKU'] = '';
      mapped['Purchase Price'] = '';
      mapped['Selling Price'] = '';
      mapped['Stock Quantity'] = '0';
      mapped['Low Stock Threshold'] = '0';
      mapped['MOQ'] = '';
      mapped['Stock Status'] = 'Out of Stock';

      return mapped as ProductImportRow;
    });
  };

  const validateRows = () => {
    const required = ['Product Name', 'Description', 'Product Type', 'Brand', 'Supplier'];
    const mappingErrors = getDuplicateImportMappingErrors(mapping, Object.fromEntries(productFields.map((field) => [field.key, field.slug])));
    if (mappingErrors.length) return mappingErrors;
    const errors: string[] = [];
    const missingMappings = required.filter((field) => !mapping[field]);
    if (missingMappings.length) return [`Map all required columns: ${missingMappings.join(', ')}.`];
    rows.forEach((row, index) => {
      const line = index + 2;
      required.forEach((field) => {
        if (!String(row[mapping[field]] || '').trim()) errors.push(`Row ${line}: ${field} is required.`);
      });
    });
    return errors.slice(0, 10).concat(errors.length > 10 ? [`And ${errors.length - 10} more row error(s).`] : []);
  };

  const handleContinueToPreview = () => {
    const errors = validateRows();
    if (errors.length) { setError(errors.join(' ')); return; }
    setError('');
    setStep(2);
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
      <div className="bg-white rounded-2xl border border-[#e6e6e6] p-4 w-full max-w-5xl relative max-h-[90vh] flex flex-col overflow-hidden">
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
        <h2 className="shrink-0 text-xl font-bold text-black mb-4 border-b border-gray-200 pb-2 flex items-center gap-2">
          <FileText className="w-5 h-5 text-[#0a61d7]" /> {tImport('title')}
        </h2>
        <div className="flex-1 min-h-0 overflow-y-auto">

        {step === 0 && (
          <ImportStartPanel
            title="Product master import"
            overview="Create draft product records using product-level information only. Variant SKUs, prices, stock quantities and package settings are managed separately in the Product Catalog's Variant List."
            matchingGuide="This import creates new product records and does not match or update existing products. Product IDs are generated by Lakupak. Variant SKU, selling price, purchase price, MOQ and stock are not part of this product-level template; add them later through the Product Variant import."
            instructions={[
              'Use one row per product. Do not add separate rows for product variants in this file.',
              'Product Name, Description, Product Type, Brand and Supplier are required.',
              'Keep product-level information in this file. Do not include variant SKUs, prices, stock quantities or MOQ.',
              'Imported products are created as Draft. Add images, stock levels and variant details in the catalog afterward.',
            ]}
            columns={[
              { name: 'Product Name', required: true, description: 'Product display name.' },
              { name: 'Description', required: true, description: 'Product description.' },
              { name: 'Product Type', required: true, description: 'Product category/type.' },
              { name: 'Brand', required: true, description: 'Brand or manufacturer name.' },
              { name: 'Supplier', required: true, description: 'Supplier name associated with the product.' },
              { name: 'Catalog Name', description: 'Optional catalog grouping name.' },
            ]}
            templateName="Lakupak_Product_Template.xlsx"
            onFileSelectedAction={handleFile}
            error={error}
            filename={filename}
          />
        )}
        {step === 1 && (
          <div className="flex flex-col gap-1">
            {error ? <div className="mb-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">{error}</div> : null}
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
            <div className="sticky bottom-0 z-20 flex justify-end gap-2 mt-2 bg-white text-sm border-t border-[#e6e6e6] pt-4">
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
                onClick={handleContinueToPreview}
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
            <div className="sticky bottom-0 z-20 flex justify-end gap-2 mt-4 bg-white text-sm border-t border-[#e6e6e6] pt-4">
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
    </div>
  );
}

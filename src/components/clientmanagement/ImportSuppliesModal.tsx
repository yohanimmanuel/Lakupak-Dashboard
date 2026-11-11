'use client';

import React, { useRef, useState } from 'react';
import { Upload, X, FileText, Eye, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import * as XLSX from 'xlsx';
import { SupplyDetail } from '@/types/client';
import { useClientsTranslations } from '@/hooks/useClientsTranslations';
import ImportSelectionCheckbox from '@/components/clientmanagement/ImportSelectionCheckbox';

/** Columns the import UI can map — string fields only (not booleans / recordType). */
type ImportableSupplyField =
  | 'sku'
  | 'product'
  | 'totalSupplied'
  | 'totalValue'
  | 'lastDelivery';

const supplyFields: { key: ImportableSupplyField; label: string }[] = [
  { key: 'sku', label: 'SKU Number (Optional)' },
  { key: 'product', label: 'Product Name (Optional)' },
  { key: 'totalSupplied', label: 'Total Supplied (Optional)' },
  { key: 'totalValue', label: 'Total Value (Optional)' },
  { key: 'lastDelivery', label: 'Last Delivery (Optional)' },
];

const supplyFieldSynonyms: Record<ImportableSupplyField, string[]> = {
  sku: ['sku', 'sku number', 'kode', 'kode barang'],
  product: ['product', 'product name', 'nama produk'],
  totalSupplied: ['total supplied', 'supplied', 'jumlah', 'jumlah supply'],
  totalValue: ['total value', 'value', 'total harga', 'harga'],
  lastDelivery: ['last delivery', 'delivery date', 'tanggal', 'tanggal delivery'],
};

function getAutomap(fileHeaders: string[]) {
  const mapping: { [key: string]: string } = {};
  supplyFields.forEach(f => {
    const syns = [f.label, f.key, ...(supplyFieldSynonyms[f.key] || [])];
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

export type SupplierCatalogEntry = {
  sku: string;
  product: string;
};

type ImportSuppliesModalProps = {
  open: boolean;
  onCloseAction: () => void;
  onImportAction: (supplies: SupplyDetail[]) => void;
  /** Catalog variants owned by this supplier — used to block foreign products on preview. */
  supplierCatalog?: SupplierCatalogEntry[];
};

function normalizeKey(value: string | undefined): string {
  return String(value || '').trim().toLowerCase();
}

/** True when the row names a product/SKU that is not in this supplier's catalog. */
function isForeignSupplyRow(
  row: Pick<SupplyDetail, 'sku' | 'product'>,
  catalog: SupplierCatalogEntry[],
): boolean {
  const sku = normalizeKey(row.sku);
  const product = normalizeKey(row.product);
  if (!sku && !product) return false;
  if (catalog.length === 0) return Boolean(sku || product);

  if (sku) {
    return !catalog.some((entry) => normalizeKey(entry.sku) === sku);
  }

  return !catalog.some((entry) => {
    const entryProduct = normalizeKey(entry.product);
    if (entryProduct === product) return true;
    // Allow "Product Name" to match "Product Name (Variant)" catalog labels.
    const base = entryProduct.replace(/\s*\([^)]*\)\s*$/, '').trim();
    return base === product;
  });
}

export default function ImportSuppliesModal({
  open,
  onCloseAction,
  onImportAction,
  supplierCatalog = [],
}: ImportSuppliesModalProps) {
  const { tImport } = useClientsTranslations();

  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0); // 0: upload, 1: mapping, 2: preview
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [error, setError] = useState('');
  const [filename, setFilename] = useState('');
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<{ [key: string]: string }>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [selectedRowIndices, setSelectedRowIndices] = useState<Set<number>>(new Set());

  if (!open) return null;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError('');
    setValidationErrors([]);
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    
    // File size validation (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError(tImport('fileTooLarge'));
      return;
    }
    
    // File type validation
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
      setError(tImport('invalidFileType'));
      return;
    }
    
    setFilename(file.name);
    setIsProcessing(true);
    
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
        const json = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
        
        if (!json.length) {
          setError(tImport('fileEmpty'));
          return;
        }
        
        // Validate minimum required rows (header + at least 1 data row)
        if (json.length < 2) {
          setError(tImport('fileMinRows'));
          return;
        }
        
        const fileHeadersRow = (json[0] as string[]).map(h => h.trim()).filter(h => h);
        if (fileHeadersRow.length === 0) {
          setError(tImport('fileHeadersRequired'));
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
        setError(tImport('fileProcessFailed'));
      } finally {
        setIsProcessing(false);
      }
    };
    
    reader.onerror = () => {
      setError(tImport('fileReadFailed'));
      setIsProcessing(false);
    };
    
    if (ext === 'csv') {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  };

  const getMappedRows = (): SupplyDetail[] => {
    return rows.map((row: Record<string, string>) => {
      const mapped: Partial<Record<ImportableSupplyField, string>> = {};
      supplyFields.forEach((f) => {
        const col = mapping[f.key];
        let value = col ? row[col] : '';

        // Remove currency identifier for monetary fields
        if (f.key === 'totalValue') {
          value = removeCurrencyIdentifier(value);
        }

        mapped[f.key] = value;
      });
      return {
        suppliesno: '',
        sku: mapped.sku || '',
        product: mapped.product || '',
        totalSupplied: mapped.totalSupplied || '',
        totalValue: mapped.totalValue || '',
        lastDelivery: mapped.lastDelivery || '',
        status: '',
        recordType: 'history',
        updateCurrentStock: false,
      };
    });
  };

  const validateMappedData = (mappedRows: SupplyDetail[]) => {
    const errors: string[] = [];
    
    // Only validate that we have at least some data to import
    if (mappedRows.length === 0) {
      errors.push(tImport('noDataToImport'));
      return errors;
    }
    
    // Check if at least one field is mapped
    const hasAnyMapping = Object.keys(mapping).some(key => mapping[key]);
    if (!hasAnyMapping) {
      errors.push(tImport('mapAtLeastOne'));
      return errors;
    }
    
    return errors;
  };

  const previewRows = step === 2 ? getMappedRows() : [];
  const foreignRowIndices = previewRows
    .map((row, index) => (isForeignSupplyRow(row, supplierCatalog) ? index : -1))
    .filter((index) => index >= 0);
  const foreignSelectedCount = foreignRowIndices.filter((index) => selectedRowIndices.has(index)).length;
  const hasForeignSelected = foreignSelectedCount > 0;
  const allRowsSelected = rows.length > 0 && selectedRowIndices.size === rows.length;
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
    setSelectedRowIndices(allRowsSelected ? new Set() : new Set(rows.map((_, i) => i)));
  };

  const resetState = () => {
    setRows([]);
    setStep(0);
    setFilename('');
    setFileHeaders([]);
    setMapping({});
    setSelectedRowIndices(new Set());
    setValidationErrors([]);
    setError('');
  };

  const handleClose = () => {
    resetState();
    onCloseAction();
  };

  const handleImport = () => {
    const mappedRows = getMappedRows();
    
    // Validate mapped data
    const errors = validateMappedData(mappedRows);
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }

    const selectedRows = mappedRows.filter((_, index) => selectedRowIndices.has(index));
    if (selectedRows.length === 0) {
      setValidationErrors([]);
      setError(tImport('importNoneSelected'));
      return;
    }

    const foreignSelected = selectedRows.filter((row) => isForeignSupplyRow(row, supplierCatalog));
    if (foreignSelected.length > 0) {
      setValidationErrors([]);
      setError(tImport('supplyNotOwnedBlock'));
      return;
    }
    
    onImportAction(selectedRows);
    resetState();
    onCloseAction();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl border border-[#e6e6e6] p-4 w-full max-w-3xl relative">
        <button type="button" className="absolute top-3 right-3 p-2 rounded-full hover:bg-gray-100" onClick={handleClose}><X className="w-5 h-5 text-black" /></button>
        <h2 className="text-xl font-bold text-black mb-4 border-b border-[#e6e6e6] pb-2 flex items-center gap-2">
          <FileText className="w-5 h-5 text-[#0a61d7]" /> {tImport('titleSupplies')}
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
                {isProcessing ? tImport('uploadProcessing') : tImport('upload')}
              </span>
              {filename && <span className="text-xs text-gray-500">{filename}</span>}
            </button>
            {error && <div className="flex items-center gap-2 text-red-500 text-sm"><AlertTriangle className="w-4 h-4" /> {error}</div>}
          </div>
        )}
        {step === 1 && (
          <div className="flex flex-col gap-1 max-h-[550px] overflow-y-auto">
            <div className="mb-2 font-semibold text-black">{tImport('mapColumnsOptional')}</div>
            
            {/* Info Message */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
              <div className="flex items-center gap-2 text-blue-800 text-sm">
                <Info className="w-4 h-4" />
                <span>
                  <strong>{tImport('flexibleImport')}</strong> {tImport('flexibleImportHint')}
                </span>
              </div>
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
                  {supplyFields.map(f => (
                    <tr key={f.key} className="whitespace-nowrap">
                      <td className="py-1 px-3 font-semibold text-black">{tImport(`supplyFields.${f.key}`)}</td>
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
              <button type="button" className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200" onClick={() => { setStep(0); setRows([]); setFilename(''); setFileHeaders([]); setMapping({}); setValidationErrors([]); setSelectedRowIndices(new Set()); }}>{tImport('back')}</button>
              <button type="button" className="px-4 py-2 rounded-lg bg-[#0a61d7] text-white font-semibold hover:bg-[#084ba6] flex items-center gap-2" onClick={() => { setSelectedRowIndices(new Set(rows.map((_, i) => i))); setStep(2); }} disabled={Object.keys(mapping).filter(k => mapping[k]).length === 0}>{tImport('preview')}</button>
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
                  total: previewRows.length,
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
            
            {/* Validation Errors */}
            {validationErrors.length > 0 && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="text-red-700 text-sm font-medium mb-2">{tImport('fixErrors')}</div>
                <ul className="text-red-600 text-xs space-y-1">
                  {validationErrors.map((error, index) => (
                    <li key={index}>• {error}</li>
                  ))}
                </ul>
              </div>
            )}

            {foreignRowIndices.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-red-700">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {tImport('supplyNotOwnedTitle')}
                </div>
                <p className="text-xs text-red-600">{tImport('supplyNotOwnedHint')}</p>
              </div>
            )}
            
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full text-xs font-medium text-left bg-white">
                <thead>
                  <tr className="text-gray-500 bg-gray-100 whitespace-nowrap">
                    <th className="py-2 px-3 font-medium uppercase w-12">
                      <ImportSelectionCheckbox
                        checked={allRowsSelected}
                        indeterminate={someRowsSelected}
                        onToggle={toggleAllRowSelection}
                        ariaLabel={allRowsSelected ? tImport('deselectAll') : tImport('selectAll')}
                      />
                    </th>
                    {supplyFields.map(f => <th key={f.key} className="py-2 px-3 font-medium uppercase">{tImport(`supplyFields.${f.key}`)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, idx) => {
                    const isSelected = selectedRowIndices.has(idx);
                    const isForeign = foreignRowIndices.includes(idx);
                    return (
                      <tr
                        key={idx}
                        onClick={() => toggleRowSelection(idx)}
                        className={`whitespace-nowrap cursor-pointer ${
                          isForeign
                            ? 'bg-red-50 text-red-800'
                            : isSelected
                              ? 'text-black hover:bg-blue-50/40'
                              : 'opacity-50 bg-gray-50 text-black hover:bg-gray-100'
                        }`}
                      >
                        <td className="py-2 px-3">
                          <ImportSelectionCheckbox
                            checked={isSelected}
                            onToggle={() => toggleRowSelection(idx)}
                            ariaLabel={tImport('selectRow', { index: idx + 1 })}
                          />
                        </td>
                        {supplyFields.map((f) => (
                          <td key={f.key} className="py-2 px-3">{row[f.key] || ''}</td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {error ? (
              <div className="flex items-center gap-2 text-red-500 text-sm">
                <AlertTriangle className="w-4 h-4" /> {error}
              </div>
            ) : null}
            <div className="flex justify-end gap-2 mt-4 text-sm border-t border-gray-200 pt-4">
              <button type="button" className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200" onClick={() => { setStep(1); setValidationErrors([]); setSelectedRowIndices(new Set()); setError(''); }}>{tImport('back')}</button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-[#0a61d7] text-white font-semibold hover:bg-[#084ba6] flex items-center gap-2 disabled:opacity-60"
                onClick={handleImport}
                disabled={selectedRowIndices.size === 0 || hasForeignSelected}
              >
                <CheckCircle2 className="w-4 h-4" /> {tImport('importButtonSelected', { count: selectedRowIndices.size })}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

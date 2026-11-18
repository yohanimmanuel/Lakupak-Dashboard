'use client';

import React, { useRef, useState } from 'react';
import { Upload, X, FileText, Eye, CheckCircle2, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { OrderDetail } from '@/types/client';
import type { StockLevel } from '@/types/product';
import { formatBuyerOrderTotal, parseBuyerOrderTotal } from '@/utils/buyerOrderQuantity';
import { useClientsTranslations } from '@/hooks/useClientsTranslations';
import ImportSelectionCheckbox from '@/components/clientmanagement/ImportSelectionCheckbox';
import ClientCatalogSelect from '@/components/clientmanagement/ClientCatalogSelect';

const orderFields = [
  { key: 'product', label: 'Product' },
  { key: 'sku', label: 'SKU' },
  { key: 'variantName', label: 'Variant' },
  { key: 'totalOrders', label: 'Total Orders' },
  { key: 'stockType', label: 'Stock Type' },
  { key: 'pricePerPackage', label: 'Price / Pckg' },
  { key: 'totalSpend', label: 'Total Spend' },
  { key: 'outstanding', label: 'Total Outstanding' },
  { key: 'lastOrderDate', label: 'Last Order Date' },
];

const orderFieldSynonyms: { [key: string]: string[] } = {
  product: ['product', 'product name', 'nama produk', 'item'],
  sku: ['sku', 'sku number', 'item code', 'product code', 'kode barang'],
  variantName: ['variant', 'variant name', 'product variant', 'option', 'variant produk'],
  totalOrders: ['total orders', 'total orders (boxes)', 'orders', 'boxes', 'quantity', 'qty', 'jumlah', 'jumlah box'],
  stockType: ['stock type', 'stock unit', 'unit', 'package type', 'package unit', 'order unit', 'satuan', 'jenis stok', 'jenis kemasan'],
  pricePerPackage: ['price / pckg', 'price per package', 'price per pkg', 'unit price', 'harga per unit', 'harga satuan'],
  totalSpend: ['total spend', 'spend', 'total', 'total harga', 'harga'],
  outstanding: ['outstanding', 'total outstanding', 'balance due', 'piutang', 'utang'],
  lastOrderDate: ['last order date', 'order date', 'tanggal', 'tanggal order'],
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

type BuyerImportProduct = NonNullable<ImportOrdersModalProps['productCatalog']>[number];

function matchCatalogProduct(
  productValue: string,
  catalog: BuyerImportProduct[],
  skuValue?: string,
  variantValue?: string,
) {
  const raw = String(productValue || '').trim().toLowerCase();
  const sku = String(skuValue || '').trim().toLowerCase();
  const variantName = String(variantValue || '').trim().toLowerCase();
  const variants = catalog.flatMap((product) =>
    (product.variantOptions || []).map((variant) => ({ product, variant })),
  );

  // A distributor SKU is an alias only when it identifies one catalog variant.
  if (sku) {
    const skuMatches = variants.filter(({ variant }) => String(variant.sku || '').trim().toLowerCase() === sku);
    if (skuMatches.length === 1) return skuMatches[0];
    if (skuMatches.length > 1 && variantName) {
      const narrowed = skuMatches.filter(({ variant }) => variant.variantName.trim().toLowerCase() === variantName);
      if (narrowed.length === 1) return narrowed[0];
    }
  }

  if (!raw) return undefined;
  const exactVariantLabel = variants.filter(({ product, variant }) =>
    (product.name + ' (' + variant.variantName + ')').trim().toLowerCase() === raw,
  );
  if (exactVariantLabel.length === 1) return exactVariantLabel[0];

  const baseName = raw.replace(/\s*\([^)]*\)\s*$/, '').trim();
  const productMatches = catalog.filter((product) => product.name.trim().toLowerCase() === baseName);
  if (productMatches.length !== 1) return undefined;

  if (variantName) {
    const matchingVariants = (productMatches[0].variantOptions || []).filter(
      (variant) => variant.variantName.trim().toLowerCase() === variantName,
    );
    if (matchingVariants.length === 1) return { product: productMatches[0], variant: matchingVariants[0] };
  }
  return { product: productMatches[0], variant: undefined };
}

type ImportOrdersModalProps = {
  open: boolean;
  onCloseAction: () => void;
  onImportAction: (orderDetails: OrderDetail[]) => void;
  productCatalog?: Array<{
    productId: string;
    name: string;
    stockLevels?: StockLevel[] | null;
    variantOptions?: Array<{ id: number; variantName: string; sku?: string | null; isActive?: boolean | null }> | null;
  }>;
};

export default function ImportOrdersModal({
  open,
  onCloseAction,
  onImportAction,
  productCatalog = [],
}: ImportOrdersModalProps) {
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

  const getMappedRows = () => {
    return rows.map((row: Record<string, string>) => {
      const mapped: Partial<OrderDetail> = {};
      orderFields.forEach(f => {
        const col = mapping[f.key];
        let value: string | undefined = col ? row[col] : '';
        
        // Remove currency identifier for monetary fields
        if (f.key === 'pricePerPackage' || f.key === 'totalSpend' || f.key === 'outstanding') {
          value = removeCurrencyIdentifier(value);
        }
        
        mapped[f.key as keyof OrderDetail] = value as never;
      });
      const catalogMatch = matchCatalogProduct(String(mapped.product || ''), productCatalog, String(mapped.sku || ''), String(mapped.variantName || ''));
      const levels = catalogMatch?.product.stockLevels || [{ name: 'Pieces', piecesPerUnit: 1 }];
      const parsed = parseBuyerOrderTotal(String(mapped.totalOrders || ''), String(mapped.stockType || 'Pieces'));
      const requestedUnit = String(row.__stockType || mapped.stockType || parsed.unit || 'Pieces').trim();
      const selectedLevel = levels.find((level) => level.name.toLowerCase() === requestedUnit.toLowerCase());
      const stockType = selectedLevel?.name || requestedUnit || 'Pieces';
      const selectedVariantId = row.__variantOverride
        ? String(row.__variantOptionId || '')
        : String(row.__variantOptionId || catalogMatch?.variant?.id || '');
      const selectedVariant = catalogMatch?.product.variantOptions?.find((variant) => String(variant.id) === selectedVariantId);
      return {
        ...(mapped as OrderDetail),
        totalOrders: parsed.isMixed
          ? String(mapped.totalOrders || '')
          : formatBuyerOrderTotal(parsed.quantity, stockType),
        stockType,
        piecesPerPackage: selectedLevel ? Number(selectedLevel.piecesPerUnit) || 1 : undefined,
        productId: catalogMatch?.product.productId,
        variantOptionId: selectedVariant?.id == null ? undefined : String(selectedVariant.id),
        sku: String(mapped.sku || selectedVariant?.sku || ''),
        variantName: String(selectedVariant?.variantName || mapped.variantName || ''),
        pricePerPackage: String(mapped.pricePerPackage || ''),
      } as OrderDetail;
    });
  };

  const validateMappedData = (mappedRows: OrderDetail[]) => {
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

    const invalidStockTypes = mappedRows.filter((row) => {
      const parsed = parseBuyerOrderTotal(String(row.totalOrders || ''), String(row.stockType || 'Pieces'));
      if (parsed.isMixed || !String(row.totalOrders || '').trim()) return false;
      const product = productCatalog.find((item) => item.productId === row.productId);
      const levels = product?.stockLevels?.length ? product.stockLevels : [{ name: 'Pieces', piecesPerUnit: 1 }];
      return !levels.some((level) => level.name.toLowerCase() === String(row.stockType || parsed.unit || 'Pieces').trim().toLowerCase());
    });
    if (invalidStockTypes.length > 0) {
      errors.push(`Select a valid stock type for ${invalidStockTypes.length} row(s). Check that the SKU or product matches a catalog item with the selected stock level.`);
    }
    
    return errors;
  };

  const previewRows = step === 2 ? getMappedRows() : [];
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
    
    onImportAction(selectedRows);
    resetState();
    onCloseAction();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl border border-[#e6e6e6] p-4 w-full max-w-3xl relative">
        <button type="button" className="absolute top-3 right-3 p-2 rounded-full hover:bg-gray-100" onClick={handleClose}><X className="w-5 h-5 text-black" /></button>
        <h2 className="text-xl font-bold text-black mb-4 border-b border-[#e6e6e6] pb-2 flex items-center gap-2">
          <FileText className="w-5 h-5 text-[#0a61d7]" /> {tImport('titleOrders')}
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
            <div className="mb-2 font-semibold text-black">{tImport('mapColumnsRequired')}</div>
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white p-2">
              <table className="min-w-full text-xs font-medium text-left">
                <thead>
                  <tr className="text-gray-500 bg-gray-100 whitespace-nowrap">
                    <th className="py-2 px-3 font-medium uppercase">{tImport('field')}</th>
                    <th className="py-2 px-3 font-medium uppercase">{tImport('mapToColumn')}</th>
                  </tr>
                </thead>
                <tbody>
                  {orderFields.map(f => (
                    <tr key={f.key} className="whitespace-nowrap">
                      <td className="py-1 px-3 font-semibold text-black">{tImport(`orderFields.${f.key}`)}</td>
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
              <button type="button" className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200" onClick={() => { setStep(0); setRows([]); setFilename(''); setFileHeaders([]); setMapping({}); setSelectedRowIndices(new Set()); }}>{tImport('back')}</button>
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
                    {orderFields.map(f => <th key={f.key} className="py-2 px-3 font-medium uppercase">{tImport(`orderFields.${f.key}`)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, idx) => {
                    const isSelected = selectedRowIndices.has(idx);
                    return (
                      <tr
                        key={idx}
                        onClick={() => toggleRowSelection(idx)}
                        className={`whitespace-nowrap text-black cursor-pointer ${
                          isSelected ? 'hover:bg-blue-50/40' : 'opacity-50 bg-gray-50 hover:bg-gray-100'
                        }`}
                      >
                        <td className="py-2 px-3">
                          <ImportSelectionCheckbox
                            checked={isSelected}
                            onToggle={() => toggleRowSelection(idx)}
                            ariaLabel={tImport('selectRow', { index: idx + 1 })}
                          />
                        </td>
                        {orderFields.map((f) => (
                          <td key={f.key} className="min-w-[8rem] py-2 px-3">
                            {f.key === 'variantName' ? (() => {
                              const raw = rows[idx] || {};
                              const productField = mapping.product;
                              const matched = matchCatalogProduct(productField ? raw[productField] : '', productCatalog);
                              const variants = (matched?.product.variantOptions || []).filter((variant) => variant.isActive !== false);
                              const currentVariant = raw.__variantOverride
                                ? String(raw.__variantOptionId || '')
                                : String(raw.__variantOptionId || matched?.variant?.id || '');
                              return (
                                <ClientCatalogSelect
                                  value={currentVariant}
                                  placeholder={row.variantName || 'Select variant'}
                                  allowNone={false}
                                  options={variants.filter((variant) => String(variant.variantName || '').trim().toLowerCase() !== 'none').map((variant) => ({ value: String(variant.id), label: variant.variantName }))}
                                  onChange={(variantId: string) => setRows((current) => current.map((item, rowIndex) => rowIndex === idx ? { ...item, __variantOptionId: variantId, __variantOverride: 'true' } : item))}
                                  disabled={!matched?.product}
                                  searchPlaceholder="Search variant..."
                                />
                              );
                            })() : f.key === 'totalOrders' ? (
                              <span>{parseBuyerOrderTotal(row.totalOrders, row.stockType || 'Pieces').quantity}</span>
                            ) : f.key === 'stockType' ? (() => {
                              const raw = rows[idx] || {};
                              const productField = mapping.product;
                              const skuField = mapping.sku;
                              const variantField = mapping.variantName;
                              const matched = matchCatalogProduct(
                                productField ? raw[productField] : '',
                                productCatalog,
                                skuField ? raw[skuField] : '',
                                variantField ? raw[variantField] : '',
                              );
                              const options = matched?.product.stockLevels?.length
                                ? matched.product.stockLevels
                                : [{ name: 'Pieces', piecesPerUnit: 1 }];
                              const currentUnit = String(raw.__stockType || row.stockType || 'Pieces');
                              return (
                                <ClientCatalogSelect
                                  className="min-w-[8rem]"
                                  value={currentUnit}
                                  placeholder="Pieces"
                                  options={options.map((level) => ({ value: level.name, label: level.name }))}
                                  allowNone={false}
                                  onChange={(stockType: string) => setRows((current) => current.map((item, rowIndex) => rowIndex === idx ? { ...item, __stockType: stockType } : item))}
                                  searchPlaceholder="Search stock type..."
                                  disabled={!matched?.product}
                                />
                              );
                            })() : row[f.key as keyof OrderDetail]}
                          </td>
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
              <button type="button" className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200" onClick={() => { setStep(1); setSelectedRowIndices(new Set()); setError(''); }}>{tImport('back')}</button>
              <button type="button" className="px-4 py-2 rounded-lg bg-[#0a61d7] text-white font-semibold hover:bg-[#084ba6] flex items-center gap-2 disabled:opacity-60" onClick={handleImport} disabled={selectedRowIndices.size === 0}><CheckCircle2 className="w-4 h-4" /> {tImport('importButtonSelected', { count: selectedRowIndices.size })}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

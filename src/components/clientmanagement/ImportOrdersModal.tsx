'use client';

import React, { useState } from 'react';
import { X, FileText, Eye, CheckCircle2, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { OrderDetail } from '@/types/client';
import type { StockLevel } from '@/types/product';
import { formatBuyerOrderTotal, parseBuyerOrderTotal } from '@/utils/buyerOrderQuantity';
import { useClientsTranslations } from '@/hooks/useClientsTranslations';
import ImportSelectionCheckbox from '@/components/clientmanagement/ImportSelectionCheckbox';
import ClientCatalogSelect from '@/components/clientmanagement/ClientCatalogSelect';
import ImportStartPanel, { getDuplicateImportMappingErrors } from '@/components/imports/ImportStartPanel';

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
  const norm = (value: unknown) => String(value || '').trim().toLocaleLowerCase();
  const raw = norm(productValue);
  const sku = norm(skuValue);
  const variantName = norm(variantValue);
  const variants = catalog.flatMap((product) =>
    (product.variantOptions || []).filter((variant) => variant.isActive !== false).map((variant) => ({ product, variant })),
  );

  if (sku) {
    const bySku = variants.filter(({ variant }) => norm(variant.sku) === sku);
    if (bySku.length === 1) return bySku[0];
    if (bySku.length > 1 && variantName) {
      const narrowed = bySku.filter(({ variant }) => norm(variant.variantName) === variantName);
      if (narrowed.length === 1) return narrowed[0];
    }
  }

  const exactProducts = raw ? catalog.filter((product) => norm(product.name) === raw) : [];
  if (exactProducts.length !== 1) return undefined;
  const product = exactProducts[0];
  const productVariants = (product.variantOptions || []).filter((variant) => variant.isActive !== false);
  if (variantName) {
    const exactVariants = productVariants.filter((variant) => norm(variant.variantName) === variantName);
    if (exactVariants.length === 1) return { product, variant: exactVariants[0] };
    return undefined;
  }
  return productVariants.length === 1 ? { product, variant: productVariants[0] } : { product, variant: undefined };
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

  const handleFile = (file?: File) => {
    setError('');
    setValidationErrors([]);
    if (!file) return;
    
    // File size validation (max 5MB)
    if (file.size > 10 * 1024 * 1024) {
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
        
        const sourceHeaders = (json[0] as string[]).map((h) => String(h ?? '').trim());
        const fileHeadersRow = sourceHeaders.filter(Boolean);
        if (new Set(fileHeadersRow.map((header) => header.toLocaleLowerCase())).size !== fileHeadersRow.length) { setError('The file contains duplicate column headers. Rename duplicate headers and upload again.'); return; }
        if (fileHeadersRow.length === 0) {
          setError(tImport('fileHeadersRequired'));
          return;
        }
        
        const dataRows = json.slice(1).map((row: unknown[]): Record<string, string> => {
          const obj: Record<string, string> = {};
          sourceHeaders.forEach((h, i) => { if (h) obj[h] = String(row[i] ?? ''); });
          return obj;
        }).filter((row) => Object.values(row).some((value) => String(value).trim()));
        if (!dataRows.length) { setError('The file contains no data rows.'); return; }
        const autoMapping = getAutomap(fileHeadersRow);
        // Unknown distributor-specific headers remain available for manual mapping.
        setFileHeaders(fileHeadersRow);
        setRows(dataRows);
        setMapping(autoMapping);
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
        product: String(mapped.product || catalogMatch?.product.name || ''),
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
    if (!mappedRows.length) return [tImport('noDataToImport')];
    if (!mapping.totalOrders || (!mapping.product && !mapping.sku)) {
      return ['Map Product or SKU and Total Orders before continuing.'];
    }
    const mappingErrors = getDuplicateImportMappingErrors(mapping, Object.fromEntries(orderFields.map((field) => [field.key, field.label])));
    if (mappingErrors.length) return mappingErrors;
    const rowErrors: string[] = [];
    rows.forEach((raw, index) => {
      const row = mappedRows[index];
      const line = index + 2;
      const match = matchCatalogProduct(String(row.product || ''), productCatalog, String(row.sku || ''), String(row.variantName || ''));
      // Catalog mismatches are highlighted in preview, not repeated per row.
      if (match) {
        if (String(row.sku || '').trim() && String(match.variant?.sku || '').trim().toLocaleLowerCase() !== String(row.sku || '').trim().toLocaleLowerCase()) {
          rowErrors.push(`Row ${line}: SKU does not belong to the selected Product + Variant.`);
        }
        if (String(row.product || '').trim() && String(match.product.name || '').trim().toLocaleLowerCase() !== String(row.product || '').trim().toLocaleLowerCase()) {
          rowErrors.push(`Row ${line}: Product name conflicts with the matched SKU.`);
        }
        const originalVariant = mapping.variantName ? String(raw[mapping.variantName] || '').trim() : '';
        if (originalVariant && String(match.variant?.variantName || '').trim().toLocaleLowerCase() !== originalVariant.toLocaleLowerCase()) {
          rowErrors.push(`Row ${line}: Variant name conflicts with the matched SKU.`);
        }
        if (!match.variant && (match.product.variantOptions || []).filter((v) => v.isActive !== false).length > 1) {
          rowErrors.push(`Row ${line}: more than one variant matches this product. Add the exact SKU or Variant.`);
        }
      }
      const parsed = parseBuyerOrderTotal(String(row.totalOrders || ''), String(row.stockType || 'Pieces'));
      if (parsed.isMixed || !String(parsed.quantity || '').trim() || !Number.isFinite(Number(parsed.quantity)) || Number(parsed.quantity) <= 0) {
        rowErrors.push(`Row ${line}: Total Orders must be a positive number.`);
      }
      const product = match?.product;
      const levels = product?.stockLevels?.length ? product.stockLevels : [{ name: 'Pieces', piecesPerUnit: 1 }];
      const rawStockType = mapping.stockType ? String(raw[mapping.stockType] || '').trim() : '';
      const embeddedUnit = parseBuyerOrderTotal(String(raw[mapping.totalOrders] || ''), '').unit.trim();
      if (!rawStockType && !embeddedUnit) rowErrors.push(`Row ${line}: Stock Type is required. Use a separate Stock Type column or a combined value such as "10 Pieces".`);
      const requested = String(raw.__stockType || rawStockType || embeddedUnit || row.stockType || 'Pieces').trim().toLocaleLowerCase();
      if (!levels.some((level) => level.name.toLocaleLowerCase() === requested)) {
        rowErrors.push(`Row ${line}: Stock Type "${requested}" is not configured for the matched product.`);
      }
    });
    if (rowErrors.length) errors.push(...rowErrors.slice(0, 10), ...(rowErrors.length > 10 ? [`And ${rowErrors.length - 10} more row error(s).`] : []));
    return errors;
  };

  const mismatchedRowIndices = rows
    .map((raw, index) => {
      const row = getMappedRows()[index];
      return matchCatalogProduct(String(row.product || ''), productCatalog, String(row.sku || ''), String(row.variantName || '')) ? -1 : index;
    })
    .filter((index) => index >= 0);
  const hasCatalogMismatches = mismatchedRowIndices.length > 0;

  const handleContinueToPreview = () => {
    const errors = validateMappedData(getMappedRows());
    if (errors.length) { setValidationErrors(errors); return; }
    setValidationErrors([]);
    setSelectedRowIndices(new Set(rows.map((_, index) => index)));
    setStep(2);
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

    if (mismatchedRowIndices.some((index) => selectedRowIndices.has(index))) {
      setError(tImport('buyerCatalogMismatchSummary'));
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
      <div className="bg-white rounded-2xl border border-[#e6e6e6] p-4 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden relative">
        <button type="button" className="absolute top-3 right-3 p-2 rounded-full hover:bg-gray-100" onClick={handleClose}><X className="w-5 h-5 text-black" /></button>
        <h2 className="shrink-0 text-xl font-bold text-black mb-4 border-b border-[#e6e6e6] pb-2 flex items-center gap-2">
          <FileText className="w-5 h-5 text-[#0a61d7]" /> {tImport('titleOrders')}
        </h2>
        <div className="flex-1 min-h-0 overflow-y-auto">
        {step === 0 && (
          <ImportStartPanel
            title={tImport('buyerGuideTitle')}
            overview={tImport('buyerGuideOverview')}
            matchingGuide={tImport('buyerGuideMatching')}
            instructions={[
              tImport('buyerGuideInstruction0'),
              tImport('buyerGuideInstruction1'),
              tImport('buyerGuideInstruction2'),
              tImport('buyerGuideInstruction3'),
            ]}
            columns={[
              { name: tImport('buyerGuideColumn0Name'), description: tImport('buyerGuideColumn0Description') },
              { name: tImport('buyerGuideColumn1Name'), description: tImport('buyerGuideColumn1Description') },
              { name: tImport('buyerGuideColumn2Name'), description: tImport('buyerGuideColumn2Description') },
              { name: tImport('buyerGuideColumn3Name'), required: true, description: tImport('buyerGuideColumn3Description') },
              { name: tImport('buyerGuideColumn4Name'), required: true, description: tImport('buyerGuideColumn4Description') },
              { name: tImport('buyerGuideColumn5Name'), description: tImport('buyerGuideColumn5Description') },
              { name: tImport('buyerGuideColumn6Name'), description: tImport('buyerGuideColumn6Description') },
              { name: tImport('buyerGuideColumn7Name'), description: tImport('buyerGuideColumn7Description') },
              { name: tImport('buyerGuideColumn8Name'), description: tImport('buyerGuideColumn8Description') },
            ]}
            templateName="Lakupak_Buyer_Records_Template.xlsx"
            onFileSelectedAction={handleFile}
            error={error}
            filename={filename}
            processing={isProcessing}
          />
        )}
        {step === 1 && (
          <div className="flex flex-col gap-1">
            {error ? <div className="mb-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">{error}</div> : null}
            {validationErrors.length > 0 ? <div className="mb-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">{validationErrors.map((item, index) => <p key={index}>{item}</p>)}</div> : null}
            {hasCatalogMismatches && (
              <div className="mb-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">
                {tImport('buyerCatalogMismatchSummary')}
              </div>
            )}
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
            <div className="sticky bottom-0 z-20 flex justify-end gap-2 mt-2 bg-white text-sm border-t border-gray-200 pt-4">
              <button type="button" className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200" onClick={() => { setStep(0); setRows([]); setFilename(''); setFileHeaders([]); setMapping({}); setSelectedRowIndices(new Set()); }}>{tImport('back')}</button>
              <button type="button" className="px-4 py-2 rounded-lg bg-[#0a61d7] text-white font-semibold hover:bg-[#084ba6] flex items-center gap-2" onClick={handleContinueToPreview} disabled={Object.keys(mapping).filter(k => mapping[k]).length === 0}>{tImport('preview')}</button>
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
            
            {hasCatalogMismatches && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">
                {tImport('buyerCatalogMismatchSummary')}
              </div>
            )}
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
                    const isMismatched = mismatchedRowIndices.includes(idx);
                    return (
                      <tr
                        key={idx}
                        onClick={() => toggleRowSelection(idx)}
                        className={`whitespace-nowrap text-black cursor-pointer ${
                          isMismatched ? 'bg-red-50 text-red-800' : isSelected ? 'hover:bg-blue-50/40' : 'opacity-50 bg-gray-50 hover:bg-gray-100'
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
            <div className="sticky bottom-0 z-20 flex justify-end gap-2 mt-4 bg-white text-sm border-t border-gray-200 pt-4">
              <button type="button" className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200" onClick={() => { setStep(1); setSelectedRowIndices(new Set()); setError(''); }}>{tImport('back')}</button>
              <button type="button" className="px-4 py-2 rounded-lg bg-[#0a61d7] text-white font-semibold hover:bg-[#084ba6] flex items-center gap-2 disabled:opacity-60" onClick={handleImport} disabled={selectedRowIndices.size === 0 || mismatchedRowIndices.some((index) => selectedRowIndices.has(index))}><CheckCircle2 className="w-4 h-4" /> {tImport('importButtonSelected', { count: selectedRowIndices.size })}</button>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

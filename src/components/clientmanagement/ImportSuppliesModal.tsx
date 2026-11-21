'use client';

import React, { useState } from 'react';
import { X, FileText, Eye, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import * as XLSX from 'xlsx';
import { SupplyDetail } from '@/types/client';
import type { StockLevel } from '@/types/product';
import { convertSupplyQuantityToPieces, getSupplyUnitOptions } from '@/lib/suppliers/supplyPackageUnits';
import { useClientsTranslations } from '@/hooks/useClientsTranslations';
import ImportSelectionCheckbox from '@/components/clientmanagement/ImportSelectionCheckbox';
import ClientCatalogSelect from '@/components/clientmanagement/ClientCatalogSelect';
import ImportStartPanel, { getDuplicateImportMappingErrors } from '@/components/imports/ImportStartPanel';
import { normalizeImportVariant } from '@/lib/catalog/importVariantMatching';

/** Columns the import UI can map — string fields only (not booleans / recordType). */
type ImportableSupplyField =
  | 'product'
  | 'sku'
  | 'variantName'
  | 'totalSupplied'
  | 'receivedUnit'
  | 'totalValue'
  | 'lastSuppliedDate';

const supplyFields: { key: ImportableSupplyField; label: string }[] = [
  { key: 'product', label: 'Product (Optional)' },
  { key: 'sku', label: 'SKU (Optional)' },
  { key: 'variantName', label: 'Variant (Optional)' },
  { key: 'totalSupplied', label: 'Received Quantity (Optional)' },
  { key: 'receivedUnit', label: 'Received Unit / Package Type (Optional)' },
  { key: 'totalValue', label: 'Purchase Value (Optional)' },
  { key: 'lastSuppliedDate', label: 'Last Supplied Date (Optional)' },
];

const supplyFieldSynonyms: Record<ImportableSupplyField, string[]> = {
  product: ['product', 'product name', 'nama produk', 'item', 'description'],
  sku: ['sku', 'sku number', 'kode', 'kode barang', 'item code', 'product code'],
  variantName: ['variant', 'variant name', 'product variant', 'option', 'variant produk'],
  totalSupplied: ['total supplied', 'total supplied (pieces)', 'received quantity', 'received', 'received (package type)', 'received quantity (received unit)', 'received quantity (package type)', 'supplied', 'quantity', 'qty', 'jumlah', 'jumlah supply'],
  receivedUnit: ['stock type', 'stock unit', 'received unit', 'package type', 'package unit', 'received package type', 'received stock type', 'unit', 'satuan', 'jenis stok', 'jenis kemasan'],
  totalValue: ['purchase value', 'purchase amount', 'total value', 'value', 'total harga', 'harga'],
  lastSuppliedDate: ['last supplied date', 'last supplied', 'last delivery', 'delivery date', 'tanggal', 'tanggal delivery'],
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
  variantOptionId?: number;
  sku: string;
  product: string;
  productId?: string;
  variantName?: string;
  stockLevels?: StockLevel[];
};

type ImportSuppliesModalProps = {
  open: boolean;
  onCloseAction: () => void;
  onImportAction: (supplies: SupplyDetail[]) => void;
  /** Catalog variants owned by this supplier — used to block foreign products on preview. */
  supplierCatalog?: SupplierCatalogEntry[];
};

function normalizeKey(value: string | undefined): string {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function productNameMatches(input: string, catalogProduct: string, variant: string): boolean {
  const actual = normalizeKey(input);
  const catalog = normalizeKey(catalogProduct);
  const variantSuffix = normalizeKey(variant);
  return actual === catalog ||
    (variantSuffix.length > 0 && actual === `${catalog} (${variantSuffix})`);
}

/**
 * Older supplier exports combined quantity and package type in one cell
 * (for example, "80 Pieces" or "2 Cartons"). New exports use separate
 * Received Quantity and Stock Type columns. Keep both formats importable.
 */
function splitReceivedQuantityAndUnit(value: string | undefined): { quantity: string; unit: string } {
  const raw = String(value || '').trim();
  const match = raw.match(/^([\d,]+(?:\.\d+)?)\s+(.+?)\s*$/);
  if (!match) return { quantity: raw, unit: '' };
  return { quantity: match[1].replace(/,/g, ''), unit: match[2].trim() };
}

function getCatalogMatch(row: Record<string, string>, mapping: Record<string, string>, catalog: SupplierCatalogEntry[]) {
  const sku = normalizeKey(mapping.sku ? row[mapping.sku] : '');
  const product = normalizeKey(mapping.product ? row[mapping.product] : '');
  const variantName = normalizeKey(mapping.variantName ? row[mapping.variantName] : '');
  if (sku) {
    const skuMatches = catalog.filter((entry) => normalizeKey(entry.sku) === sku);
    if (skuMatches.length === 1) return skuMatches[0];
    if (skuMatches.length > 1 && variantName) {
      const exact = skuMatches.filter((entry) => normalizeImportVariant(entry.variantName) === normalizeImportVariant(variantName));
      if (exact.length === 1) return exact[0];
    }
    // An old SKU may have been replaced. Only reconcile it when both the
    // product AND variant name uniquely identify one current catalog variant.
    // A SKU mismatch by itself must never guess a replacement.
    if (!product || !variantName) return undefined;
    const replacement = catalog.filter((entry) =>
      productNameMatches(product, entry.product, entry.variantName || '') &&
      normalizeImportVariant(entry.variantName) === normalizeImportVariant(variantName),
    );
    return replacement.length === 1 ? replacement[0] : undefined;
  }
  if (!product) return undefined;
  const exactProducts = catalog.filter((entry) => productNameMatches(product, entry.product, entry.variantName || ''));
  const exact = exactProducts.filter((entry) => !variantName || normalizeImportVariant(entry.variantName) === normalizeImportVariant(variantName));
  return exact.length === 1 ? exact[0] : undefined;
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

  const [step, setStep] = useState(0); // 0: upload, 1: mapping, 2: preview
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [error, setError] = useState('');
  const [filename, setFilename] = useState('');
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<{ [key: string]: string }>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [selectedRowIndices, setSelectedRowIndices] = useState<Set<number>>(new Set());
  const [importMode, setImportMode] = useState<'catalog' | 'historical'>('catalog');

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
        // Preserve distributor-specific headers for manual mapping before validation.
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
      const catalogMatch = getCatalogMatch(row, mapping, supplierCatalog);
      const combinedReceived = splitReceivedQuantityAndUnit(mapped.totalSupplied);
      const receivedQuantity = combinedReceived.unit
        ? combinedReceived.quantity
        : String(mapped.totalSupplied || '').trim();
      // A manually mapped Stock Type column wins. Otherwise use the unit parsed
      // from the legacy combined export column, then default numeric-only rows to Pieces.
      const requestedUnit = String(
        row.__receivedUnit || mapped.receivedUnit || combinedReceived.unit || 'Pieces',
      ).trim();
      const stockLevels = getSupplyUnitOptions(catalogMatch?.stockLevels);
      const matchedUnit = stockLevels.find((level) => level.name.toLowerCase() === requestedUnit.toLowerCase());
      const receivedUnit = matchedUnit?.name || requestedUnit || 'Pieces';
      const totalSuppliedPieces = matchedUnit
        ? convertSupplyQuantityToPieces(receivedQuantity, receivedUnit, stockLevels)
        : null;
      return {
        suppliesno: '',
        sku: importMode === 'catalog' ? (catalogMatch?.sku || mapped.sku || '') : (mapped.sku || ''),
        product: importMode === 'catalog' ? (catalogMatch?.product || mapped.product || '') : (mapped.product || ''),
        productId: importMode === 'historical' ? undefined : catalogMatch?.productId,
        variantOptionId: importMode === 'historical' ? null : catalogMatch?.variantOptionId,
        variantName: importMode === 'catalog' ? (catalogMatch?.variantName || mapped.variantName || '') : (mapped.variantName || ''),
        receivedQuantity,
        receivedUnit,
        totalSupplied: totalSuppliedPieces == null ? '' : String(totalSuppliedPieces),
        totalValue: mapped.totalValue || '',
        lastSuppliedDate: mapped.lastSuppliedDate || '',
        status: '',
        recordType: 'history',
        updateCurrentStock: false,
      };
    });
  };

  const validateMappedData = (mappedRows: SupplyDetail[]) => {
    if (!mappedRows.length) return [tImport('noDataToImport')];
    if (!mapping.totalSupplied || (!mapping.sku && !mapping.product)) {
      return ['Map Received Quantity and either SKU or Product + Variant before continuing.'];
    }
    const mappingErrors = getDuplicateImportMappingErrors(mapping, Object.fromEntries(supplyFields.map((field) => [field.key, field.label])));
    if (mappingErrors.length) return mappingErrors;
    const errors: string[] = [];
    rows.forEach((raw, index) => {
      const line = index + 2;
      const row = mappedRows[index];
      const match = getCatalogMatch(raw, mapping, supplierCatalog);
      // Catalog mismatches are previewable, but cannot be imported until
      // corrected or switched to Historical Receipt mode.
      if (match && importMode === 'catalog') {
        // A unique Product + Variant match is allowed to replace an obsolete SKU.
        // The preview displays the current catalog SKU before import.
        const rawProduct = mapping.product ? String(raw[mapping.product] || '') : '';
        if (rawProduct && !productNameMatches(rawProduct, match.product, match.variantName || '')) {
          errors.push(`Row ${line}: Product name conflicts with the matched SKU.`);
        }
        const rawVariant = mapping.variantName ? String(raw[mapping.variantName] || '') : '';
        if (rawVariant && normalizeImportVariant(match.variantName) !== normalizeImportVariant(rawVariant)) errors.push(tImport('catalogMismatchSummary'));
      }
      const quantity = String(row.receivedQuantity || '').trim();
      if (!quantity || !/^\d+(?:\.\d+)?$/.test(quantity) || Number(quantity) <= 0) errors.push(`Row ${line}: Received Quantity must be a positive number.`);
      const rawCombined = splitReceivedQuantityAndUnit(mapping.totalSupplied ? raw[mapping.totalSupplied] : '');
      const rawUnit = mapping.receivedUnit ? String(raw[mapping.receivedUnit] || '').trim() : '';
      if (!rawUnit && !rawCombined.unit) errors.push(`Row ${line}: Stock Type is required. Use a separate Stock Type column or a legacy value such as "80 Pieces".`);
      const levels = getSupplyUnitOptions(match?.stockLevels);
      if (!levels.some((level) => level.name.toLocaleLowerCase() === String(row.receivedUnit || '').trim().toLocaleLowerCase())) {
        errors.push(`Row ${line}: Stock Type "${row.receivedUnit}" cannot be converted without a matching catalog product. Choose Pieces or match the product first.`);
      }
      if (!row.totalSupplied) errors.push(`Row ${line}: Quantity cannot be converted safely to Pieces.`);
    });
    return [...new Set(errors)].slice(0, 10);
  };

  const mismatchedRowIndices = importMode === 'catalog'
    ? rows.map((raw, index) => getCatalogMatch(raw, mapping, supplierCatalog) ? -1 : index)
        .filter((index) => index >= 0)
    : [];
  const hasCatalogMismatches = mismatchedRowIndices.length > 0;

  const handleContinueToPreview = () => {
    const errors = validateMappedData(getMappedRows());
    if (errors.length) { setValidationErrors(errors); return; }
    setValidationErrors([]);
    setSelectedRowIndices(new Set(rows.map((_, index) => index)));
    setStep(2);
  };

  const previewRows = step === 2 ? getMappedRows() : [];
  const foreignRowIndices = previewRows
    .map((row, index) => (importMode === 'catalog' && isForeignSupplyRow(row, supplierCatalog) ? index : -1))
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
    setImportMode('catalog');
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
    if (importMode === 'catalog' &&
        mismatchedRowIndices.some((index) => selectedRowIndices.has(index))) {
      setValidationErrors([]);
      setError(tImport('catalogMismatchSummary'));
      return;
    }

    const selectedRows = mappedRows.filter((_, index) => selectedRowIndices.has(index));
    if (selectedRows.length === 0) {
      setValidationErrors([]);
      setError(tImport('importNoneSelected'));
      return;
    }

    const invalidReceivedRows = selectedRows.filter((row) => !row.receivedQuantity || row.totalSupplied === '');
    if (invalidReceivedRows.length > 0) {
      setError('Enter a whole-number received quantity and select a valid stock type for every imported row.');
      return;
    }

    const foreignSelected = importMode === 'catalog'
      ? selectedRows.filter((row) => isForeignSupplyRow(row, supplierCatalog))
      : [];
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
      <div className="bg-white rounded-2xl border border-[#e6e6e6] p-4 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden relative">
        <button type="button" className="absolute top-3 right-3 p-2 rounded-full hover:bg-gray-100" onClick={handleClose}><X className="w-5 h-5 text-black" /></button>
        <h2 className="shrink-0 text-xl font-bold text-black mb-4 border-b border-[#e6e6e6] pb-2 flex items-center gap-2">
          <FileText className="w-5 h-5 text-[#0a61d7]" /> {tImport('titleSupplies')}
        </h2>
        <div className="flex-1 min-h-0 overflow-y-auto">
        {step === 0 && (
          <ImportStartPanel
            title={tImport('supplierGuideTitle')}
            overview={tImport('supplierGuideOverview')}
            matchingGuide={tImport('supplierGuideMatching')}
            instructions={[
              tImport('supplierGuideInstruction0'),
              tImport('supplierGuideInstruction1'),
              tImport('supplierGuideInstruction2'),
              tImport('supplierGuideInstruction3'),
            ]}
            columns={[
              { name: tImport('supplierGuideColumn0Name'), description: tImport('supplierGuideColumn0Description') },
              { name: tImport('supplierGuideColumn1Name'), description: tImport('supplierGuideColumn1Description') },
              { name: tImport('supplierGuideColumn2Name'), description: tImport('supplierGuideColumn2Description') },
              { name: tImport('supplierGuideColumn3Name'), required: true, description: tImport('supplierGuideColumn3Description') },
              { name: tImport('supplierGuideColumn4Name'), required: true, description: tImport('supplierGuideColumn4Description') },
              { name: tImport('supplierGuideColumn5Name'), description: tImport('supplierGuideColumn5Description') },
              { name: tImport('supplierGuideColumn6Name'), description: tImport('supplierGuideColumn6Description') },
            ]}
            exampleRows={[["Example Product","EXAMPLE-SKU-1","Size: 30 x 2 | Colour: Blue","5","Pieces","100000","2026-11-21"],["Example Product","EXAMPLE-SKU-2","Size: 90 x 2 | Flavour: Spicy | Colour: Black","10","Pieces","200000","2026-11-21"],["Example Product","EXAMPLE-SKU-3","Size: 40 x 3 | Flavour: BBQ","2","Pieces","50000","2026-11-21"]]}
            templateName="Lakupak_Supplier_Records_Template.xlsx"
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
                {tImport('catalogMismatchSummary')}
              </div>
            )}
            <div className="mb-3 rounded-lg border border-gray-200 p-3 text-sm text-gray-800">
              <div className="mb-2 font-semibold">{tImport('modeTitle')}</div>
              <div className="flex flex-wrap gap-4">
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="radio" checked={importMode === 'catalog'} onChange={() => { setImportMode('catalog'); setValidationErrors([]); }} />
                  {tImport('modeCatalog')}
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="radio" checked={importMode === 'historical'} onChange={() => { setImportMode('historical'); setValidationErrors([]); }} />
                  {tImport('modeHistorical')}
                </label>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                {importMode === 'historical'
                  ? tImport('modeHistoricalHint')
                  : tImport('modeCatalogHint')}
              </p>
            </div>
            {importMode === 'catalog' && rows.some((raw) => {
              const match = getCatalogMatch(raw, mapping, supplierCatalog);
              const sku = mapping.sku ? String(raw[mapping.sku] || '') : '';
              return match && sku && normalizeKey(sku) !== normalizeKey(match.sku);
            }) && (
              <div className="mb-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                {tImport('replacementNotice')}
              </div>
            )}
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
            <div className="sticky bottom-0 z-20 flex justify-end gap-2 mt-2 bg-white text-sm border-t border-gray-200 pt-4">
              <button type="button" className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200" onClick={() => { setStep(0); setRows([]); setFilename(''); setFileHeaders([]); setMapping({}); setValidationErrors([]); setSelectedRowIndices(new Set()); }}>{tImport('back')}</button>
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

            {hasCatalogMismatches && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">
                {tImport('catalogMismatchSummary')}
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
                    <th className="py-2 px-3 font-medium uppercase">{tImport('supplyFields.product')}</th>
                    <th className="py-2 px-3 font-medium uppercase">{tImport('supplyFields.sku')}</th>
                    <th className="py-2 px-3 font-medium uppercase">{tImport('supplyFields.variantName')}</th>
                    <th className="py-2 px-3 font-medium uppercase">{tImport('supplyFields.totalSupplied')} ({tImport('supplyFields.receivedUnit')})</th>
                    <th className="py-2 px-3 font-medium uppercase">{tImport('supplyFields.totalValue')}</th>
                    <th className="py-2 px-3 font-medium uppercase">{tImport('supplyFields.lastSuppliedDate')}</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, idx) => {
                    const isSelected = selectedRowIndices.has(idx);
                    const isForeign = foreignRowIndices.includes(idx);
                    const isMismatched = mismatchedRowIndices.includes(idx);
                    return (
                      <tr
                        key={idx}
                        onClick={() => toggleRowSelection(idx)}
                        className={`whitespace-nowrap cursor-pointer ${
                          isForeign || isMismatched
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
                        {(['product', 'sku', 'variantName'] as const).map((key) => (
                          <td key={key} className="py-2 px-3">{row[key] || ''}</td>
                        ))}
                        <td className="py-2 px-3">
                          <div className="flex min-w-[15rem] items-center gap-2">
                            <span>{row.receivedQuantity || ''}</span>
                            {(() => {
                              const raw = rows[idx] || {};
                              const catalogMatch = getCatalogMatch(raw, mapping, supplierCatalog);
                              const options = getSupplyUnitOptions(catalogMatch?.stockLevels);
                              const selected = String(raw.__receivedUnit || row.receivedUnit || 'Pieces');
                              return (
                                <ClientCatalogSelect
                                  value={selected}
                                  placeholder={options.some((level) => level.name.toLowerCase() === selected.toLowerCase()) ? 'Pieces' : `Unknown: ${selected}`}
                                  options={options.map((level) => ({ value: level.name, label: level.name }))}
                                  allowNone={false}
                                  onChange={(receivedUnit: string) => setRows((current) => current.map((item, rowIndex) => rowIndex === idx ? { ...item, __receivedUnit: receivedUnit } : item))}
                                  searchPlaceholder="Search stock type..."
                                />
                              );
                            })()}
                          </div>
                        </td>
                        <td className="py-2 px-3">{row.totalValue || ''}</td>
                        <td className="py-2 px-3">{row.lastSuppliedDate || ''}</td>
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
              <button type="button" className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200" onClick={() => { setStep(1); setValidationErrors([]); setSelectedRowIndices(new Set()); setError(''); }}>{tImport('back')}</button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-[#0a61d7] text-white font-semibold hover:bg-[#084ba6] flex items-center gap-2 disabled:opacity-60"
                onClick={handleImport}
                disabled={selectedRowIndices.size === 0 || hasForeignSelected || mismatchedRowIndices.some((index) => selectedRowIndices.has(index))}
              >
                <CheckCircle2 className="w-4 h-4" /> {tImport('importButtonSelected', { count: selectedRowIndices.size })}
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

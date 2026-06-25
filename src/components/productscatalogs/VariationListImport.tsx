'use client';

import React, { useMemo, useRef, useState } from 'react';
import { Upload, X, FileText, Eye, CheckCircle2, AlertTriangle, Loader2, Plus, Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useProductsTranslations } from '@/hooks/useProductsTranslations';

export type VariationImportVariantColumn = {
  id: string;
  label: string;
};

export type VariationImportRow = {
  variantValues: Record<string, string>;
  /** Variant column values in left-to-right order (supports extra import levels). */
  variantValuesByPosition: string[];
  sku: string;
  sellingPrice: string;
  purchasePrice: string;
  moq: string;
  stockQuantity: string;
  lowStockThreshold: string;
  stockStatus: string;
};

export type VariationImportResult = {
  updated: number;
  skipped: number;
};

export type VariationImportVariantLevel = {
  columnId: string;
  typeName: string;
};

export type VariationImportPayload = {
  rows: VariationImportRow[];
  variantLevels: VariationImportVariantLevel[];
};

type VariationListImportProps = {
  open: boolean;
  onCloseAction: () => void;
  variantColumns: VariationImportVariantColumn[];
  onImportAction: (data: VariationImportPayload) => Promise<VariationImportResult>;
};

type ImportField = {
  mappingKey: string;
  label: string;
  slug: string;
  variantId?: string;
};

const FIXED_FIELDS: ImportField[] = [
  { mappingKey: 'sku', label: 'SKU', slug: 'sku' },
  { mappingKey: 'sellingPrice', label: 'Selling Price', slug: 'sellingPrice' },
  { mappingKey: 'purchasePrice', label: 'Purchase Price', slug: 'purchasePrice' },
  { mappingKey: 'moq', label: 'MOQ', slug: 'moq' },
  { mappingKey: 'stockQuantity', label: 'Stock Quantity', slug: 'stockQuantity' },
  { mappingKey: 'lowStockThreshold', label: 'Low Stock Threshold', slug: 'lowStockThreshold' },
  { mappingKey: 'stockStatus', label: 'Status', slug: 'stockStatus' },
];

const FIXED_SYNONYMS: Record<string, string[]> = {
  SKU: ['sku', 'kode', 'kode barang', 'stock keeping unit'],
  'Selling Price': ['selling price', 'sell price', 'price', 'harga jual', 'harga'],
  'Purchase Price': ['purchase price', 'buy price', 'cost', 'harga beli', 'harga modal'],
  MOQ: ['moq', 'minimum order', 'minimum order quantity', 'pesanan minimum'],
  'Stock Quantity': ['stock quantity', 'stock', 'qty', 'quantity', 'jumlah stok', 'stok', 'stock qty'],
  'Low Stock Threshold': ['low stock threshold', 'threshold', 'ambang bawah', 'low threshold'],
  Status: ['status', 'stock status', 'status stok'],
};

function isFixedFieldHeader(header: string) {
  const normalized = header.trim().toLowerCase();
  for (const [label, syns] of Object.entries(FIXED_SYNONYMS)) {
    if (label.toLowerCase() === normalized) return true;
    if (syns.some((s) => s.toLowerCase() === normalized)) return true;
  }
  return false;
}

function buildVariantFields(variantColumns: VariationImportVariantColumn[]): ImportField[] {
  return variantColumns.map((col) => ({
    mappingKey: col.id,
    label: col.label,
    slug: `variant_${col.id}`,
    variantId: col.id,
  }));
}

function isNonEmptyRow(row: Record<string, string>) {
  return Object.values(row).some((v) => String(v ?? '').trim() !== '');
}

function buildFields(variantColumns: VariationImportVariantColumn[]): ImportField[] {
  return [...buildVariantFields(variantColumns), ...FIXED_FIELDS];
}

function buildSynonyms(variantColumns: VariationImportVariantColumn[]): Record<string, string[]> {
  const synonyms: Record<string, string[]> = { ...FIXED_SYNONYMS };
  variantColumns.forEach((col, index) => {
    const extras = [
      col.label,
      `var ${index + 1}`,
      `var${index + 1}`,
      `variant ${index + 1}`,
    ].filter(Boolean);
    synonyms[col.label] = extras;
  });
  return synonyms;
}

function isExtraImportColumn(id: string) {
  return id.startsWith('import-var-');
}

function buildVariantMappingFromFile(
  fileHeaders: string[],
  variantColumns: VariationImportVariantColumn[],
  fixedMapping: Record<string, string>,
  varLevelLabel: (index: number) => string,
): { mapping: Record<string, string>; extras: VariationImportVariantColumn[] } {
  const used = new Set(Object.values(fixedMapping).filter(Boolean));
  const mapping: Record<string, string> = { ...fixedMapping };
  const extras: VariationImportVariantColumn[] = [];
  const synonyms = buildSynonyms(variantColumns);

  // Match catalog variant slots by label synonyms (e.g. variant type "Size" → Size column).
  variantColumns.forEach((col) => {
    const syns = [col.label, ...(synonyms[col.label] || [])];
    const found = fileHeaders.find(
      (h) =>
        h &&
        !used.has(h) &&
        syns.some((s) => s.toLowerCase() === h.trim().toLowerCase()),
    );
    if (found) {
      mapping[col.id] = found;
      used.add(found);
    }
  });

  const variantCandidateHeaders = fileHeaders.filter(
    (h) => h && !used.has(h) && !isFixedFieldHeader(h),
  );

  let candidateIdx = 0;

  // Fill unmapped catalog slots in order — Var 1 gets the first leftover variation column.
  variantColumns.forEach((col) => {
    if (mapping[col.id]) return;
    const header = variantCandidateHeaders[candidateIdx++];
    if (header) {
      mapping[col.id] = header;
      used.add(header);
    }
  });

  // Any remaining variation columns become extra levels (Var N+1, …).
  while (candidateIdx < variantCandidateHeaders.length) {
    const header = variantCandidateHeaders[candidateIdx++];
    const levelIndex = variantColumns.length + extras.length + 1;
    const id = `import-var-${levelIndex}-${header}`;
    extras.push({ id, label: varLevelLabel(levelIndex) });
    mapping[id] = header;
    used.add(header);
  }

  return { mapping, extras };
}

export default function VariationListImport({
  open,
  onCloseAction,
  variantColumns,
  onImportAction,
}: VariationListImportProps) {
  const { tCatalog } = useProductsTranslations();
  const t = (key: string, values?: Record<string, string | number>) =>
    tCatalog(`variationImport.${key}` as Parameters<typeof tCatalog>[0], values as never);

  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [error, setError] = useState('');
  const [filename, setFilename] = useState('');
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [extraVariantColumns, setExtraVariantColumns] = useState<VariationImportVariantColumn[]>([]);

  const baseVariantColumns = useMemo(
    () => [...variantColumns, ...extraVariantColumns],
    [variantColumns, extraVariantColumns],
  );

  const previewVariantColumns = useMemo(
    () =>
      baseVariantColumns.map((col) => ({
        ...col,
        label: mapping[col.id]?.trim() || col.label,
      })),
    [baseVariantColumns, mapping],
  );

  const variantImportFields = useMemo(
    () => buildVariantFields(baseVariantColumns),
    [baseVariantColumns],
  );
  const previewImportFields = useMemo(() => buildFields(previewVariantColumns), [previewVariantColumns]);
  const fieldSynonyms = useMemo(() => buildSynonyms(baseVariantColumns), [baseVariantColumns]);

  const getFieldLabel = (field: ImportField) => {
    if (field.variantId) return field.label;
    return t(`fields.${field.slug}` as 'fields.sku');
  };

  const getPreviewFieldLabel = (field: ImportField) => {
    if (field.variantId) {
      return mapping[field.mappingKey]?.trim() || field.label;
    }
    return t(`fields.${field.slug}` as 'fields.sku');
  };

  const getAutomap = (headers: string[], fields: ImportField[]) => {
    const nextMapping: Record<string, string> = {};
    const usedHeaders = new Set<string>();

    fields.forEach((f) => {
      const syns = f.variantId
        ? [f.label, ...(fieldSynonyms[f.label] || [])]
        : [f.label, ...(FIXED_SYNONYMS[f.label] || [])];
      const found = headers.find(
        (h) =>
          !usedHeaders.has(h) &&
          syns.some((s) => s.toLowerCase() === h.trim().toLowerCase()),
      );
      if (found) {
        nextMapping[f.mappingKey] = found;
        usedHeaders.add(found);
      }
    });
    return nextMapping;
  };

  const getUnusedHeaders = (currentMapping: Record<string, string>) => {
    const used = new Set(Object.values(currentMapping).filter(Boolean));
    return fileHeaders.filter((h) => !used.has(h));
  };

  const resetState = () => {
    setRows([]);
    setStep(0);
    setFilename('');
    setFileHeaders([]);
    setMapping({});
    setError('');
    setImporting(false);
    setExtraVariantColumns([]);
  };

  const handleAddVariationLevel = () => {
    const nextIndex = baseVariantColumns.length + 1;
    const id = `import-var-${nextIndex}-${Date.now()}`;
    const label = t('varLevelLabel', { index: nextIndex });
    setExtraVariantColumns((prev) => [...prev, { id, label }]);

    const used = new Set(Object.values(mapping).filter(Boolean));
    const candidate = fileHeaders.find((h) => !used.has(h) && !isFixedFieldHeader(h));
    if (candidate) {
      setMapping((m) => ({ ...m, [id]: candidate }));
    }
  };

  const handleRemoveVariationLevel = (columnId: string) => {
    if (!isExtraImportColumn(columnId)) return;
    setExtraVariantColumns((prev) => prev.filter((c) => c.id !== columnId));
    setMapping((m) => {
      const next = { ...m };
      delete next[columnId];
      return next;
    });
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError('');
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    const ext = file.name.split('.').pop()?.toLowerCase();
    const reader = new FileReader();
    reader.onload = (evt: ProgressEvent<FileReader>) => {
      if (!evt.target?.result) {
        setError(t('fileReadError'));
        return;
      }
      try {
        let workbook: XLSX.WorkBook;
        if (ext === 'csv') {
          workbook = XLSX.read(evt.target.result as string, { type: 'string' });
        } else {
          workbook = XLSX.read(new Uint8Array(evt.target.result as ArrayBuffer), { type: 'array' });
        }
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];
        if (!json.length) {
          setError(t('fileEmpty'));
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
          setError(t('fileEmpty'));
          return;
        }

        setFileHeaders(fileHeadersRow);
        setRows(dataRows);

        const fixedMapping = getAutomap(fileHeadersRow, FIXED_FIELDS);
        const { mapping: initialMapping, extras } = buildVariantMappingFromFile(
          fileHeadersRow,
          variantColumns,
          fixedMapping,
          (index) => t('varLevelLabel', { index }),
        );

        setExtraVariantColumns(extras);
        setMapping(initialMapping);

        setStep(1);
      } catch {
        setError(t('fileReadError'));
      }
    };
    if (ext === 'csv') reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  };

  const getMappedRows = (): VariationImportRow[] =>
    rows.map((row) => {
      const variantValues: Record<string, string> = {};
      const variantValuesByPosition: string[] = [];
      let sku = '';
      let sellingPrice = '';
      let purchasePrice = '';
      let moq = '';
      let stockQuantity = '';
      let lowStockThreshold = '';
      let stockStatus = '';

      variantImportFields.forEach((f) => {
        const col = mapping[f.mappingKey];
        const value = col ? String(row[col] ?? '').trim() : '';
        variantValuesByPosition.push(value);
        if (f.variantId) variantValues[f.variantId] = value;
      });

      FIXED_FIELDS.forEach((f) => {
        const col = mapping[f.mappingKey];
        const value = col ? String(row[col] ?? '').trim() : '';
        if (f.slug === 'sku') sku = value;
        else if (f.slug === 'sellingPrice') sellingPrice = value;
        else if (f.slug === 'purchasePrice') purchasePrice = value;
        else if (f.slug === 'moq') moq = value;
        else if (f.slug === 'stockQuantity') stockQuantity = value;
        else if (f.slug === 'lowStockThreshold') lowStockThreshold = value;
        else if (f.slug === 'stockStatus') stockStatus = value;
      });

      return {
        variantValues,
        variantValuesByPosition,
        sku,
        sellingPrice,
        purchasePrice,
        moq,
        stockQuantity,
        lowStockThreshold,
        stockStatus,
      };
    });

  const handleImport = async () => {
    const mappedRows = getMappedRows();
    const variantLevels = baseVariantColumns
      .filter((col) => Boolean(mapping[col.id]?.trim()))
      .map((col) => ({
        columnId: col.id,
        typeName: mapping[col.id].trim(),
      }));
    setImporting(true);
    setError('');
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
    try {
      const result = await onImportAction({ rows: mappedRows, variantLevels });
      if (result.updated === 0) {
        setError(t('importNoMatch'));
        setImporting(false);
        return;
      }
      resetState();
      onCloseAction();
    } catch {
      setError(t('importError'));
      setImporting(false);
    }
  };

  const notice = (
    <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
      <p className="text-amber-900 text-sm font-medium">{t('noticeTitle')}</p>
      <p className="text-amber-800 text-sm mt-1">{t('noticeBody')}</p>
    </div>
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl border border-[#e6e6e6] p-4 w-full max-w-5xl relative max-h-[90vh] overflow-y-auto">
        <button
          type="button"
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
          <FileText className="w-5 h-5 text-[#0a61d7]" /> {t('title')}
        </h2>

        {step === 0 && (
          <div className="flex flex-col gap-4 py-4">
            {notice}
            <div className="flex flex-col items-center justify-center gap-4">
              <input type="file" accept=".xlsx,.xls,.csv" ref={inputRef} className="hidden" onChange={handleFile} />
              <button
                type="button"
                className="flex flex-col items-center gap-2 px-6 py-4 rounded-lg border-2 border-dashed border-[#0a61d7] bg-[#f7faff] hover:bg-[#e6f0ff] transition"
                onClick={() => inputRef.current?.click()}
              >
                <Upload className="w-8 h-8 text-[#0a61d7]" />
                <span className="text-[#0a61d7] font-semibold">{t('upload')}</span>
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
            {notice}
            <div className="mb-2 font-semibold text-black">{t('mapColumnsOptional')}</div>
            <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-blue-700 text-sm">
                <strong>{t('flexibleImport')}</strong> {t('flexibleImportHint')}
              </p>
            </div>
            <div className="overflow-x-auto rounded-lg border border-[#e6e6e6] bg-white p-2">
              <table className="min-w-full text-xs font-medium text-left">
                <thead>
                  <tr className="text-gray-500 bg-gray-100 whitespace-nowrap">
                    <th className="py-2 px-3 font-medium uppercase">{t('field')}</th>
                    <th className="py-2 px-3 font-medium uppercase">{t('mapToColumn')}</th>
                  </tr>
                </thead>
                <tbody>
                  {variantImportFields.map((f) => (
                    <tr key={f.mappingKey} className="whitespace-nowrap">
                      <td className="py-1 px-3 font-semibold text-black">
                        <div className="flex items-center gap-2">
                          <span>{getFieldLabel(f)}</span>
                          {f.variantId && isExtraImportColumn(f.variantId) && (
                            <button
                              type="button"
                              onClick={() => handleRemoveVariationLevel(f.variantId!)}
                              className="text-red-500 hover:text-red-700"
                              title={t('removeVariationLevel')}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-1 px-3">
                        <select
                          className="w-full border border-gray-200 rounded px-2 py-1 text-black text-xs"
                          value={mapping[f.mappingKey] || ''}
                          onChange={(e) => setMapping((m) => ({ ...m, [f.mappingKey]: e.target.value }))}
                        >
                          <option value="">{t('notMapped')}</option>
                          {fileHeaders.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={2} className="py-2 px-3">
                      <button
                        type="button"
                        onClick={handleAddVariationLevel}
                        className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-[#0a61d7] border border-dashed border-[#0a61d7] rounded-lg hover:bg-[#f7faff] transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        {t('addVariationLevel')}
                      </button>
                      {getUnusedHeaders(mapping).length > 0 && (
                        <p className="mt-1 text-[11px] text-gray-500">
                          {t('unmappedHeadersHint', { headers: getUnusedHeaders(mapping).join(', ') })}
                        </p>
                      )}
                    </td>
                  </tr>
                  {FIXED_FIELDS.map((f) => (
                    <tr key={f.mappingKey} className="whitespace-nowrap">
                      <td className="py-1 px-3 font-semibold text-black">{getFieldLabel(f)}</td>
                      <td className="py-1 px-3">
                        <select
                          className="w-full border border-gray-200 rounded px-2 py-1 text-black text-xs"
                          value={mapping[f.mappingKey] || ''}
                          onChange={(e) => setMapping((m) => ({ ...m, [f.mappingKey]: e.target.value }))}
                        >
                          <option value="">{t('notMapped')}</option>
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
                  setExtraVariantColumns([]);
                }}
              >
                {t('back')}
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-[#0a61d7] text-white font-semibold hover:bg-[#084ba6] flex items-center gap-2"
                onClick={() => setStep(2)}
                disabled={Object.keys(mapping).filter((k) => mapping[k]).length === 0}
              >
                {t('preview')}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            {notice}
            <div className="flex items-center gap-2 mb-2 text-black">
              <Eye className="w-4 h-4 text-[#0a61d7]" /> {t('previewRows', { count: rows.length })}
            </div>
            <div className="overflow-x-auto rounded-lg border border-[#e6e6e6]">
              <table className="min-w-full text-xs font-medium text-left bg-white">
                <thead>
                  <tr className="text-gray-500 bg-gray-100 whitespace-nowrap">
                    {previewImportFields.map((f) => (
                      <th key={f.mappingKey} className="py-2 px-3 font-medium uppercase">
                        {getPreviewFieldLabel(f)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {getMappedRows().map((row, idx) => (
                    <tr key={idx} className="whitespace-nowrap text-black">
                      {previewImportFields.map((f) => (
                        <td key={f.mappingKey} className="py-2 px-3">
                          {f.variantId
                            ? row.variantValues[f.variantId] ?? ''
                            : String(row[f.slug as keyof VariationImportRow] ?? '')}
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
                {t('back')}
              </button>
              <button
                type="button"
                className="min-w-[220px] justify-center px-4 py-2 rounded-lg bg-[#0a61d7] text-white font-semibold hover:bg-[#084ba6] flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:bg-[#0a61d7]"
                onClick={handleImport}
                disabled={importing}
              >
                {importing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" /> {t('importing')}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 shrink-0" /> {t('importButton')}
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

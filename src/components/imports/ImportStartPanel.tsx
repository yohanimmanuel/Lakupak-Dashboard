'use client';

import React, { useRef, useState } from 'react';
import { AlertTriangle, Download, FileSpreadsheet, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';

export type ImportColumnGuide = {
  name: string;
  required?: boolean;
  description: string;
};

/** Prevent a single source column from being accidentally assigned to multiple fields. */
export function getDuplicateImportMappingErrors(
  mapping: Record<string, string>,
  fieldLabels: Record<string, string> = {},
): string[] {
  const fieldsByHeader = new Map<string, string[]>();
  Object.entries(mapping).forEach(([field, header]) => {
    const key = String(header || '').trim().toLocaleLowerCase();
    if (!key) return;
    const fields = fieldsByHeader.get(key) || [];
    fields.push(fieldLabels[field] || field);
    fieldsByHeader.set(key, fields);
  });
  return Array.from(fieldsByHeader.values())
    .filter((fields) => fields.length > 1)
    .map((fields) => `The same source column is mapped to multiple fields (${fields.join(', ')}). Assign a different column to each field.`);
}

type ImportStartPanelProps = {
  title: string;
  overview: string;
  matchingGuide: string;
  instructions: string[];
  columns: ImportColumnGuide[];
  templateName: string;
  onFileSelectedAction: (file: File) => void;
  error?: string;
  filename?: string;
  processing?: boolean;
};

/** Shared first screen for every Lakupak spreadsheet import. */
export default function ImportStartPanel({
  title,
  overview,
  matchingGuide,
  instructions,
  columns,
  templateName,
  onFileSelectedAction,
  error,
  filename,
  processing = false,
}: ImportStartPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [active, setActive] = useState(false);

  const downloadTemplate = () => {
    const headers = columns.map((column) => column.name);
    // Templates intentionally contain headers only; never include example or live records.
    const templateSheet = XLSX.utils.aoa_to_sheet([headers]);
    templateSheet['!cols'] = columns.map((column) => ({ wch: Math.max(16, Math.min(42, column.name.length + 5)) }));

    const guideRows: (string | number)[][] = [
      ['Lakupak Import Template', title],
      ['Purpose', overview],
      ['Before importing', 'Keep the header row unchanged. Add one record per row, with each value under its matching column.'],
      ['Matching and aliases', matchingGuide],
      [],
      ['Column', 'Required', 'Description'],
      ...columns.map((column) => [column.name, column.required ? 'Yes' : 'No', column.description]),
      [],
      ['Important', 'If validation fails, the file will stop before preview. Correct the indicated rows/columns and upload again.'],
    ];
    const guideSheet = XLSX.utils.aoa_to_sheet(guideRows);
    guideSheet['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 84 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, templateSheet, 'Lakupak Template');
    XLSX.utils.book_append_sheet(workbook, guideSheet, 'Instructions');
    XLSX.writeFile(workbook, templateName.endsWith('.xlsx') ? templateName : `${templateName}.xlsx`);
  };

  const acceptFile = (file?: File) => {
    if (!file) return;
    setActive(true);
    onFileSelectedAction(file);
  };

  return (
    <div className="grid grid-cols-1 gap-4 py-3 lg:grid-cols-2">
      <section className="min-w-0 rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-2 flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-[#0a61d7]" />
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        </div>
        <p className="mb-3 text-sm leading-5 text-gray-600">{overview}</p>
        <div className="mb-3 rounded-lg bg-gray-50 p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-700">Before you import</p>
          <ol className="list-decimal space-y-1 pl-4 text-xs leading-5 text-gray-600">
            {instructions.map((instruction, index) => <li key={index}>{instruction}</li>)}
          </ol>
        </div>
        <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50 p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-800">Matching and aliases</p>
          <p className="text-xs leading-5 text-blue-900">{matchingGuide}</p>
        </div>
        <div className="mb-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-700">Column guide</p>
          <div className="rounded-lg border border-gray-200">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-gray-100 text-gray-600">
                <tr><th className="px-2 py-2">Column</th><th className="px-2 py-2">Use</th></tr>
              </thead>
              <tbody>
                {columns.map((column) => (
                  <tr key={column.name} className="border-t border-gray-100 align-top">
                    <td className="whitespace-nowrap px-2 py-2 font-medium text-gray-800">
                      {column.name}{column.required ? <span className="ml-1 text-red-500">*</span> : null}
                    </td>
                    <td className="px-2 py-2 text-gray-600">{column.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-[11px] text-gray-500">* Required field. Other columns may be left blank.</p>
        </div>
        <button
          type="button"
          onClick={downloadTemplate}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:border-[#0a61d7] hover:text-[#0a61d7]"
        >
          <Download className="h-4 w-4" /> Download Excel template
        </button>
      </section>

      <section className="flex min-w-0 flex-col">
        <div className="mb-2">
          <h3 className="text-base font-semibold text-gray-900">Upload your file</h3>
          <p className="mt-1 text-xs text-gray-500">Excel (.xlsx, .xls) or CSV · max 10 MB · one header row · one record per row</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(event) => { acceptFile(event.target.files?.[0]); event.currentTarget.value = ''; }}
        />
        <button
          type="button"
          disabled={processing}
          onClick={() => { setActive(true); inputRef.current?.click(); }}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); setActive(true); }}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); setActive(true); }}
          onDragLeave={(event) => { event.preventDefault(); if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            setActive(true);
            acceptFile(event.dataTransfer.files?.[0]);
          }}
          className={`flex min-h-[230px] w-full flex-1 flex-col items-center justify-center rounded-xl border-2 border-dashed px-5 py-8 text-center transition ${
            dragging || active
              ? 'border-[#0a61d7] bg-blue-50 text-[#0a61d7]'
              : 'border-gray-300 bg-gray-100 text-gray-600 hover:border-gray-400 hover:bg-gray-200'
          } disabled:cursor-wait disabled:opacity-60`}
        >
          <span className={`mb-3 flex h-14 w-14 items-center justify-center rounded-full ${dragging || active ? 'bg-blue-100' : 'bg-gray-200'}`}>
            <Upload className="h-7 w-7" />
          </span>
          <span className="text-sm font-semibold">{processing ? 'Reading file…' : 'Drag and drop your file here'}</span>
          <span className="mt-1 text-xs opacity-75">or click to browse your computer</span>
          {filename ? <span className="mt-3 max-w-full truncate rounded-md bg-white/80 px-3 py-1 text-xs font-medium">{filename}</span> : null}
        </button>
        {error ? (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}
        <div className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800">
          <strong>Import check:</strong> Lakupak validates headers, required values, numeric fields, stock types and catalog matches before opening the preview. Failed files remain on this screen.
        </div>
      </section>
    </div>
  );
}

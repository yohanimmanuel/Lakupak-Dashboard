'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  TABLE_PAGE_SIZE,
  getVisiblePageNumbers,
} from '@/utils/tablePagination';

type Props = {
  page: number;
  totalPages: number;
  total: number;
  showingLabel: string;
  onPageChange: (page: number) => void;
  previousLabel?: string;
  nextLabel?: string;
};

/**
 * Lakupak standard table pagination (Orders / Offers / Products / Clients).
 * Shows at most 10 page numbers; Next/Previous move to the next page (and next number block).
 */
export default function OfferPickerPagination({
  page,
  totalPages,
  total,
  showingLabel,
  onPageChange,
  previousLabel = 'Previous page',
  nextLabel = 'Next page',
}: Props) {
  if (total === 0) return null;

  const visiblePages = getVisiblePageNumbers(page, totalPages);

  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between mt-6 gap-2">
      <div className="text-sm text-gray-500">{showingLabel}</div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          aria-label={previousLabel}
        >
          <ChevronLeft className="w-4 h-4 text-gray-500" />
        </button>
        {visiblePages.map((p) => (
          <button
            key={p}
            type="button"
            className={`px-3 py-2 rounded-lg font-semibold text-sm transition ${
              p === page
                ? 'bg-[#0a61d7] text-white'
                : 'bg-white text-[#0a61d7] hover:bg-[#f7faff]'
            }`}
            onClick={() => onPageChange(p)}
            aria-current={p === page ? 'page' : undefined}
          >
            {p}
          </button>
        ))}
        <button
          type="button"
          className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          aria-label={nextLabel}
        >
          <ChevronRight className="w-4 h-4 text-gray-500" />
        </button>
      </div>
    </div>
  );
}

export const OFFER_PICKER_PAGE_SIZE = TABLE_PAGE_SIZE;

export function usePagedSlice<T>(items: T[], page: number, pageSize = OFFER_PICKER_PAGE_SIZE) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const paged = items.slice((safePage - 1) * pageSize, safePage * pageSize);
  const fromRow = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const toRow = Math.min(safePage * pageSize, total);
  return { paged, total, totalPages, safePage, fromRow, toRow };
}

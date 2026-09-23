'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type Props = {
  page: number;
  totalPages: number;
  total: number;
  showingLabel: string;
  onPageChange: (page: number) => void;
};

/**
 * Lakupak standard table pagination (Orders / Offers / Products).
 */
export default function OfferPickerPagination({
  page,
  totalPages,
  total,
  showingLabel,
  onPageChange,
}: Props) {
  if (total === 0) return null;

  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between mt-6 gap-2">
      <div className="text-sm text-gray-500">{showingLabel}</div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4 text-gray-500" />
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
          <button
            key={p}
            type="button"
            className={`px-3 py-2 rounded-lg font-semibold text-sm transition ${
              p === page
                ? 'bg-[#0a61d7] text-white'
                : 'bg-white text-[#0a61d7] hover:bg-[#f7faff]'
            }`}
            onClick={() => onPageChange(p)}
          >
            {p}
          </button>
        ))}
        <button
          type="button"
          className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          aria-label="Next page"
        >
          <ChevronRight className="w-4 h-4 text-gray-500" />
        </button>
      </div>
    </div>
  );
}

export const OFFER_PICKER_PAGE_SIZE = 8;

export function usePagedSlice<T>(items: T[], page: number, pageSize = OFFER_PICKER_PAGE_SIZE) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const paged = items.slice((safePage - 1) * pageSize, safePage * pageSize);
  const fromRow = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const toRow = Math.min(safePage * pageSize, total);
  return { paged, total, totalPages, safePage, fromRow, toRow };
}

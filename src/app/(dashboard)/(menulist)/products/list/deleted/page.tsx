'use client';
import React, { useEffect, useState } from 'react';
import { useProductsTranslations } from '@/hooks/useProductsTranslations';

export default function ProductDeletedPage() {
  const { tDeleted } = useProductsTranslations();
  const [pid, setPid] = useState<string | null>(null);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setPid(sp.get('id'));
  }, []);

  return (
    <div className="flex h-full min-h-full w-full min-w-0 flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-white">
      <div className="text-center bg-white border border-[#e6e6e6] rounded-lg p-8 max-w-md">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">{tDeleted('title')}</h1>
        <p className="text-sm text-gray-600 mb-6">{tDeleted('description')}</p>
        {pid ? (
          <p className="text-xs text-gray-500 mb-4">{tDeleted('reference', { id: pid })}</p>
        ) : (
          <p className="text-xs text-gray-500 mb-4" aria-hidden>Reference:</p>
        )}
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => window.history.back()}
            className="px-4 py-2 bg-[#0a61d7] text-white text-sm rounded-lg hover:bg-[#0851b8] transition-colors"
          >
            {tDeleted('goBack')}
          </button>
          <button
            onClick={() => { window.location.href = '/products/list'; }}
            className="px-4 py-2 bg-gray-200 text-gray-800 text-sm rounded-lg hover:bg-gray-300 transition-colors"
          >
            {tDeleted('addProducts')}
          </button>
        </div>
      </div>
    </div>
  );
}

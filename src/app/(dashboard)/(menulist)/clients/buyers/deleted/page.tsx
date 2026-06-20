'use client';
import React, { useEffect, useState } from 'react';
import { useClientsTranslations } from '@/hooks/useClientsTranslations';

export default function BuyerDeletedPage() {
  const { tBuyers } = useClientsTranslations();
  const [bid, setBid] = useState<string | null>(null);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setBid(sp.get('id'));
  }, []);

  return (
    <div className="w-full mx-auto bg-gradient-to-b from-gray-50 to-white h-full flex items-center justify-center">
      <div className="text-center bg-white border border-[#e6e6e6] rounded-lg p-8 max-w-md">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">{tBuyers('deleted.title')}</h1>
        <p className="text-sm text-gray-600 mb-6">{tBuyers('deleted.description')}</p>
        {bid ? (
          <p className="text-xs text-gray-500 mb-4">{tBuyers('deleted.reference', { id: bid })}</p>
        ) : (
          <p className="text-xs text-gray-500 mb-4" aria-hidden>
            {tBuyers('deleted.reference', { id: '' })}
          </p>
        )}
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => window.history.back()}
            className="px-4 py-2 bg-[#0a61d7] text-white text-sm rounded-lg hover:bg-[#0851b8] transition-colors"
          >
            {tBuyers('deleted.goBack')}
          </button>
          <button
            onClick={() => {
              window.location.href = '/clients/buyers';
            }}
            className="px-4 py-2 bg-gray-200 text-gray-800 text-sm rounded-lg hover:bg-gray-300 transition-colors"
          >
            {tBuyers('deleted.backToList')}
          </button>
        </div>
      </div>
    </div>
  );
}

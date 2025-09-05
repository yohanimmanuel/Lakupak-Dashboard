'use client';
import React, { useEffect, useState } from 'react';

export default function BuyerDeletedPage() {
  const [bid, setBid] = useState<string | null>(null);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setBid(sp.get('id'));
  }, []);

  return (
    <div className="w-full mx-auto bg-gradient-to-b from-gray-50 to-white h-full flex items-center justify-center">
      <div className="text-center bg-white border border-gray-200 rounded-lg p-8 max-w-md">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Buyer data has been deleted</h1>
        <p className="text-sm text-gray-600 mb-6">The buyer you are trying to view is no longer available. It can still appear as a reference in past orders.</p>
        {bid ? (
          <p className="text-xs text-gray-500 mb-4">Reference: {bid}</p>
        ) : (
          <p className="text-xs text-gray-500 mb-4" aria-hidden>Reference:</p>
        )}
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => window.history.back()}
            className="px-4 py-2 bg-[#0a61d7] text-white text-sm rounded-lg hover:bg-[#0851b8] transition-colors"
          >
            Go Back
          </button>
          <button
            onClick={() => { window.location.href = '/clients/buyers'; }}
            className="px-4 py-2 bg-gray-200 text-gray-800 text-sm rounded-lg hover:bg-gray-300 transition-colors"
          >
            Buyers List
          </button>
        </div>
      </div>
    </div>
  );
}



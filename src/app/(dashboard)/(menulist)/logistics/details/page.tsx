'use client';

import React, { useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import OrderfleetDetails from '@/components/logisticsmanagement/OrderfleetDetails';
import { MOCK_FLEETS } from '@/data/logisticsMockFleets';

export default function LogisticsDetailsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const fleetId = searchParams?.get('id') ?? null;

  const fleet = useMemo(
    () => (fleetId ? MOCK_FLEETS.find((f) => f.id === fleetId) : null),
    [fleetId]
  );

  if (!fleetId) {
    return (
      <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">No fleet selected.</p>
          <button
            onClick={() => router.push('/logistics')}
            className="px-4 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#0851b8] transition-colors"
          >
            Back to Logistics
          </button>
        </div>
      </div>
    );
  }

  if (!fleet) {
    return (
      <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Fleet or order not found.</p>
          <button
            onClick={() => router.push('/logistics')}
            className="px-4 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#0851b8] transition-colors"
          >
            Back to Logistics
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      <div className="w-full mx-auto">
        <OrderfleetDetails fleet={fleet} onBack={() => router.push('/logistics')} />
      </div>
    </div>
  );
}

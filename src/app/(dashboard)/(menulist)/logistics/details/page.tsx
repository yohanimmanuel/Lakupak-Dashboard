'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import OrderfleetDetails from '@/components/logisticsmanagement/OrderfleetDetails';
import { fetchFleet } from '@/data/logisticsFleetsApi';
import type { FleetOrderSummary } from '@/components/logisticsmanagement/OrderfleetList';
import { useUserStore } from '@/store/userStore';

export default function LogisticsDetailsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useUserStore();
  const fleetId = searchParams?.get('id') ?? null;
  const [fleet, setFleet] = useState<FleetOrderSummary | null | undefined>(undefined);

  useEffect(() => {
    if (!fleetId || user?.id == null) {
      if (!fleetId) setFleet(null);
      else if (user?.id == null) setFleet(null);
      return;
    }
    let cancelled = false;
    fetchFleet(user.id, fleetId)
      .then((f) => {
        if (!cancelled) setFleet(f ?? null);
      })
      .catch(() => {
        if (!cancelled) setFleet(null);
      });
    return () => { cancelled = true; };
  }, [fleetId, user?.id]);

  if (user?.id == null) {
    return (
      <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Please sign in to view fleet details.</p>
      </div>
    );
  }

  if (fleet === undefined) {
    return (
      <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

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
        <OrderfleetDetails
          fleet={fleet}
          onBack={() => router.push('/logistics')}
          onEdit={() => router.push(`/logistics/details/edit?id=${fleet.id}`)}
        />
      </div>
    </div>
  );
}

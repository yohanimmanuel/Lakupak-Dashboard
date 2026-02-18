'use client';

import React, { useMemo, useState } from 'react';
import { RefreshCcw, Download, Plus } from 'lucide-react';
import OrderfleetList, {
  type FleetOrderSummary,
  type DeliveryType,
} from '@/components/logisticsmanagement/OrderfleetList';
import FleetDetails from '@/components/logisticsmanagement/FleetDetails';
import { useUserStore } from '@/store/userStore';

const VALID_DELIVERY_TYPES: DeliveryType[] = [
  'Standard Shipping',
  'Express Shipping',
  'Same-day Delivery',
  'Next-day Delivery',
  'Scheduled Delivery',
  'Pickup Available',
];

const MOCK_FLEETS: FleetOrderSummary[] = [
  {
    id: '1',
    orderCode: '#AD345JK758',
    route: 'Warehouse Jakarta → Berastagi, North Sumatra',
    status: 'In Transit',
    orderStatus: 'Shipped',
    deliveryType: 'Standard Shipping',
    distanceLeftKm: 128.4,
    eta: 'Today, 4:15 PM',
    lastUpdate: '5 min ago',
    driverName: 'Andi Pratama',
    totalItems: 8,
  },
  {
    id: '2',
    orderCode: '#FR156KL89K',
    route: 'Bekasi → Bandung',
    status: 'Checking',
    orderStatus: 'Packed',
    deliveryType: 'Express Shipping',
    distanceLeftKm: 42.7,
    eta: 'Today, 2:30 PM',
    lastUpdate: '14 min ago',
    driverName: 'Siti Rahma',
    totalItems: 5,
  },
  {
    id: '3',
    orderCode: '#LN236NB89R',
    route: 'Surabaya → Sidoarjo',
    status: 'Delivered',
    orderStatus: 'Delivered',
    deliveryType: 'Standard Shipping',
    distanceLeftKm: 0,
    eta: 'Delivered 09:10 AM',
    lastUpdate: '1 hr ago',
    driverName: 'Budi Santoso',
    totalItems: 12,
  },
  {
    id: '4',
    orderCode: '#JK782PL190',
    route: 'Jakarta → Bogor',
    status: 'In Transit',
    orderStatus: 'Shipped',
    deliveryType: 'Same-day Delivery',
    distanceLeftKm: 18.9,
    eta: 'Today, 11:45 AM',
    lastUpdate: '2 min ago',
    driverName: 'Rizky Mahendra',
    totalItems: 3,
  },
  {
    id: '5',
    orderCode: '#BD562KL772',
    route: 'Bandung → Cimahi',
    status: 'Checking',
    orderStatus: 'Confirmed',
    deliveryType: 'Next-day Delivery',
    distanceLeftKm: 7.3,
    eta: 'Today, 12:05 PM',
    lastUpdate: '9 min ago',
    driverName: 'Yuni Kartika',
    totalItems: 7,
  },
  {
    id: '6',
    orderCode: '#SB998HG210',
    route: 'Semarang → Solo',
    status: 'In Transit',
    orderStatus: 'Shipped',
    deliveryType: 'Standard Shipping',
    distanceLeftKm: 63.4,
    eta: 'Today, 5:20 PM',
    lastUpdate: '22 min ago',
    driverName: 'Dedi Putra',
    totalItems: 15,
  },
  {
    id: '7',
    orderCode: '#DP341MN562',
    route: 'Denpasar → Ubud',
    status: 'Delayed',
    orderStatus: 'Shipped',
    deliveryType: 'Scheduled Delivery',
    distanceLeftKm: 34.1,
    eta: 'Today, 6:45 PM',
    lastUpdate: '35 min ago',
    driverName: 'Made Surya',
    totalItems: 4,
  },
  {
    id: '8',
    orderCode: '#MD743QP881',
    route: 'Medan → Binjai',
    status: 'In Transit',
    orderStatus: 'Shipped',
    deliveryType: 'Express Shipping',
    distanceLeftKm: 21.6,
    eta: 'Today, 3:30 PM',
    lastUpdate: '17 min ago',
    driverName: 'Slamet Gunawan',
    totalItems: 6,
  },
  {
    id: '9',
    orderCode: '#PL293LK004',
    route: 'Palembang → Kayu Agung',
    status: 'Checking',
    orderStatus: 'Packed',
    deliveryType: 'Pickup Available',
    distanceLeftKm: 55.2,
    eta: 'Today, 7:10 PM',
    lastUpdate: '40 min ago',
    driverName: 'Nur Aisyah',
    totalItems: 9,
  },
  {
    id: '10',
    orderCode: '#MK881ZX220',
    route: 'Makassar → Gowa',
    status: 'In Transit',
    orderStatus: 'Shipped',
    deliveryType: 'Standard Shipping',
    distanceLeftKm: 11.8,
    eta: 'Today, 1:25 PM',
    lastUpdate: '6 min ago',
    driverName: 'Hasan Abdullah',
    totalItems: 11,
  },
];

export default function LogisticsPage() {
  const { user } = useUserStore();
  const [fleets] = useState<FleetOrderSummary[]>(MOCK_FLEETS);
  const [selectedFleetId, setSelectedFleetId] = useState<string | undefined>(fleets[0]?.id);

  const availableDeliveryTypes = useMemo((): DeliveryType[] => {
    const raw = user?.company?.shippingPreferences;
    let result: DeliveryType[] = [];
    if (raw != null && raw !== '') {
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const arr = Array.isArray(parsed) ? parsed : [];
        result = arr.filter((t: string): t is DeliveryType => VALID_DELIVERY_TYPES.includes(t as DeliveryType));
      } catch {
        result = [];
      }
    }
    // Every distributor has Standard Shipping; always include it.
    if (!result.includes('Standard Shipping')) {
      result = ['Standard Shipping', ...result];
    }
    return result;
  }, [user?.company?.shippingPreferences]);

  const selectedFleet = useMemo(
    () => fleets.find(f => f.id === selectedFleetId),
    [fleets, selectedFleetId],
  );

  const handleRefresh = () => {
    // TODO: Wire up logistics data reload
  };

  const handleExport = () => {
    // TODO: Implement logistics data export (e.g., XLSX/CSV)
  };

  const handleAddFleet = () => {
    // TODO: Route to fleet/truck creation flow or open a modal
  };

  const handleOpenTracking = () => {
    // TODO: Route to full tracking page when implemented
  };

  return (
    <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Logistics Management</h1>
          <p className="text-sm text-gray-500 mb-4">
            Monitor and manage your fleet, deliveries, and logistics performance across your
            distribution network.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-[#e6e6e6] text-black rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            <RefreshCcw className="w-4 h-4" />
            Refresh
          </button>

          {/* Export Button */}
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-[#e6e6e6] text-black rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            Export Data
          </button>

          {/* Add Fleet / Truck Button */}
          <button
            onClick={handleAddFleet}
            className="flex items-center gap-2 px-6 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#0851b8] transition-colors text-sm font-semibold"
          >
            <Plus className="w-4 h-4" />
            Add Fleet / Truck
          </button>
        </div>
      </div>

      {/* Main content: list + details/tracking */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <OrderfleetList
          fleets={fleets}
          selectedFleetId={selectedFleetId}
          onSelectFleet={setSelectedFleetId}
          availableDeliveryTypes={availableDeliveryTypes}
        />
        <FleetDetails fleet={selectedFleet} onOpenTracking={handleOpenTracking} />
      </div>
    </div>
  );
}


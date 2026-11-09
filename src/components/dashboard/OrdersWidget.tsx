'use client';

import Link from 'next/link';
import { Loader2, MapPin, ShoppingCart } from 'lucide-react';
import { useTranslations } from 'next-intl';
import MapComponent from '@/components/ordershipment/MapComponent';
import { formatCurrency } from '@/components/analyticsperformance/FinancialAnalytics';
import type { Order } from '@/types/order';
import type { MapCoordinates } from '@/utils/mapboxUtils';

type LogisticsMapMarker = {
  id: string;
  coordinates: MapCoordinates;
  label: string;
  color: string;
};

const statusStyles: Record<Order['orderStatus'], string> = {
  Pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  Confirmed: 'bg-blue-50 text-blue-700 border-blue-200',
  Packed: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  Shipped: 'bg-sky-50 text-sky-700 border-sky-200',
  Delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Received: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Failed: 'bg-rose-50 text-rose-700 border-rose-200',
  Cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
  Returned: 'bg-gray-100 text-gray-600 border-gray-200',
};

type OrdersWidgetProps = {
  recentOrders: Order[];
  userCurrency: string;
  mapboxToken: string | null | undefined;
  logisticsMapMarkers: LogisticsMapMarker[];
  logisticsMapCenter?: MapCoordinates;
  isLogisticsGeocoding: boolean;
  onMarkerClick: (markerId: string) => void;
  formatOrderDate: (date: Date) => string;
  translateOrderStatus: (status: string) => string;
};

export default function OrdersWidget({
  recentOrders,
  userCurrency,
  mapboxToken,
  logisticsMapMarkers,
  logisticsMapCenter,
  isLogisticsGeocoding,
  onMarkerClick,
  formatOrderDate,
  translateOrderStatus,
}: OrdersWidgetProps) {
  const t = useTranslations('dashboard.home.widgets.orders');

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-black">{t('activeShipmentsMap')}</p>
          <span className="text-xs text-gray-500">
            {logisticsMapMarkers.length.toLocaleString()}{' '}
            {logisticsMapMarkers.length === 1 ? t('location') : t('locations')}
          </span>
        </div>
        {isLogisticsGeocoding && logisticsMapMarkers.length === 0 ? (
          <div className="flex h-72 flex-col items-center justify-center rounded-lg bg-gray-100">
            <Loader2 className="mb-3 h-8 w-8 animate-spin text-gray-400" />
            <p className="text-sm font-semibold text-gray-600">{t('loadingLocations')}</p>
            <p className="text-xs text-gray-500">{t('geocoding')}</p>
          </div>
        ) : logisticsMapMarkers.length > 0 ? (
          <MapComponent
            accessToken={mapboxToken}
            markers={logisticsMapMarkers}
            center={logisticsMapCenter}
            height="250px"
            showControls
            onMarkerClick={onMarkerClick}
          />
        ) : (
          <div className="flex h-72 flex-col items-center justify-center rounded-lg bg-gray-100">
            <MapPin className="mb-3 h-10 w-10 text-gray-400" />
            <p className="text-sm font-semibold text-gray-600">{t('noActiveShipments')}</p>
            <p className="text-xs text-gray-500">{t('noActiveShipmentsHint')}</p>
          </div>
        )}
      </div>
      {recentOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg py-6">
          <ShoppingCart className="mb-2 h-8 w-8 text-gray-300" />
          <p className="text-sm font-semibold text-gray-600">{t('emptyTitle')}</p>
          <p className="mt-1 text-xs text-gray-500">{t('emptyHint')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#e6e6e6]">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-gray-100 text-gray-500 whitespace-nowrap">
                <th className="px-3 py-2 text-left font-medium uppercase">{t('store')}</th>
                <th className="px-3 py-2 text-left font-medium uppercase">{t('contact')}</th>
                <th className="px-3 py-2 text-left font-medium uppercase">{t('date')}</th>
                <th className="px-3 py-2 text-left font-medium uppercase">{t('amount')}</th>
                <th className="px-3 py-2 text-left font-medium uppercase">{t('status')}</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((order) => {
                const statusClass =
                  statusStyles[order.orderStatus] ??
                  'bg-gray-100 text-gray-600 border-gray-200';
                return (
                  <tr key={order.id} className="border-b border-[#e6e6e6] last:border-b-0">
                    <td className="px-3 py-2 font-semibold text-black whitespace-nowrap">
                      <Link href={`/orders/details/${order.orderId}`} className="hover:text-[#0a61d7]">
                        {order.storeName}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{order.contactPerson}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                      {formatOrderDate(order.orderDate)}
                    </td>
                    <td className="px-3 py-2 font-semibold text-black whitespace-nowrap">
                      {formatCurrency(order.totalAmount, userCurrency)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass}`}
                      >
                        {translateOrderStatus(order.orderStatus)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

'use client';
import React, { useState, useEffect, useMemo, useRef } from "react";
import { MapPin, Maximize2, Loader2, Filter, ChevronDown } from "lucide-react";
import { Order } from '@/types/order';
import MapComponent from './MapComponent';
import MapFullscreenModal from '@/components/MapFullscreenModal';
import { useMapboxToken } from '@/hooks/useMapboxToken';
import { geocodeMultipleAddresses, geocodeViaProxy, GeocodeResult, MapCoordinates, getOrderStatusMarkerColor } from '@/utils/mapboxUtils';

interface OrdersGPSProps {
  orders: Order[];
}

interface MapMarker {
  id: string;
  coordinates: MapCoordinates;
  label: string;
  color: string;
}

type OrderStatus = Order['orderStatus'];
type StatusFilter = 'all' | OrderStatus;

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'Pending', label: 'Pending' },
  { value: 'Confirmed', label: 'Confirmed' },
  { value: 'Packed', label: 'Packed' },
  { value: 'Shipped', label: 'Shipped' },
  { value: 'Delivered', label: 'Delivered' },
  { value: 'Received', label: 'Received' },
  { value: 'Failed', label: 'Failed' },
  { value: 'Cancelled', label: 'Cancelled' },
  { value: 'Returned', label: 'Returned' },
];

export default function OrdersGPS({ orders }: OrdersGPSProps) {
  const { token: mapboxToken } = useMapboxToken();
  const [showFullScreenModal, setShowFullScreenModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [geocodeResults, setGeocodeResults] = useState<Map<string, GeocodeResult>>(new Map());
  const [isGeocoding, setIsGeocoding] = useState(false);
  const geocodedAddressesRef = useRef<Set<string>>(new Set());
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  
  const validOrders = Array.isArray(orders) ? orders : [];

  const filteredOrders = useMemo(() => {
    return validOrders.filter(o => {
      if (!o.deliveryAddress) return false;
      if (statusFilter === 'all') return true;
      return o.orderStatus === statusFilter;
    });
  }, [validOrders, statusFilter]);

  const currentStatusOption = STATUS_FILTER_OPTIONS.find(o => o.value === statusFilter);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setIsStatusDropdownOpen(false);
      }
    };

    if (isStatusDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isStatusDropdownOpen]);

  useEffect(() => {
    const geocodeAddresses = async () => {
      if (filteredOrders.length === 0) return;

      const addresses = filteredOrders
        .map(o => o.deliveryAddress)
        .filter((addr, index, self) => self.indexOf(addr) === index && addr);

      const needGeocoding = addresses.filter(addr => !geocodedAddressesRef.current.has(addr));

      if (needGeocoding.length === 0) return;

      needGeocoding.forEach(addr => geocodedAddressesRef.current.add(addr));

      setIsGeocoding(true);
      try {
        const newResults = mapboxToken
          ? await geocodeMultipleAddresses(needGeocoding, mapboxToken)
          : await geocodeViaProxy(needGeocoding);
        setGeocodeResults(prev => {
          const updated = new Map(prev);
          newResults.forEach((result, address) => {
            updated.set(address, result);
          });
          return updated;
        });
      } finally {
        setIsGeocoding(false);
      }
    };

    geocodeAddresses();
  }, [filteredOrders, mapboxToken]);

  const mapMarkers: MapMarker[] = useMemo(() => {
    return filteredOrders
      .map((order) => {
        const geocodeResult = geocodeResults.get(order.deliveryAddress);
        if (!geocodeResult?.coordinates) return null;

        return {
          id: order.id,
          coordinates: geocodeResult.coordinates,
          label: `${order.orderId} - ${order.orderStatus}`,
          color: getOrderStatusMarkerColor(order.orderStatus),
        };
      })
      .filter((marker): marker is MapMarker => marker !== null);
  }, [filteredOrders, geocodeResults]);

  const mapCenter: MapCoordinates | undefined = useMemo(() => {
    if (mapMarkers.length === 0) return undefined;

    const avgLng = mapMarkers.reduce((sum, m) => sum + m.coordinates.longitude, 0) / mapMarkers.length;
    const avgLat = mapMarkers.reduce((sum, m) => sum + m.coordinates.latitude, 0) / mapMarkers.length;

    return { longitude: avgLng, latitude: avgLat };
  }, [mapMarkers]);

  const handleMarkerClick = (markerId: string) => {
    const order = validOrders.find(o => o.id === markerId);
    if (order) {
      window.location.href = `/orders/details/${order.orderId}`;
    }
  };

  return (
    <>
      <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Live Delivery Tracking</h3>
          <div className="flex items-center gap-3">
            <div className="relative" ref={statusDropdownRef}>
              <button
                type="button"
                onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
                className="flex items-center gap-2 px-3 py-2 bg-white border border-[#e6e6e6] text-black rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                <Filter className="w-4 h-4" />
                {currentStatusOption?.label ?? 'All Statuses'}
                <ChevronDown className="w-4 h-4" />
              </button>
              {isStatusDropdownOpen && (
                <div className="absolute top-full right-0 mt-1 w-44 bg-white border border-[#e6e6e6] rounded-lg shadow-lg z-10">
                  {STATUS_FILTER_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setStatusFilter(option.value);
                        setIsStatusDropdownOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                        statusFilter === option.value ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => setShowFullScreenModal(true)}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              title="View full screen"
              aria-label="Open full screen map view"
            >
              <Maximize2 className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        {/* Map */}
        {isGeocoding && mapMarkers.length === 0 ? (
          <div className="bg-gray-100 rounded-lg h-[471px] flex items-center justify-center">
              <div className="text-center">
              <Loader2 className="w-12 h-12 text-gray-400 mx-auto mb-3 animate-spin" />
              <p className="text-gray-500 font-medium">Loading map...</p>
              <p className="text-sm text-gray-400">Geocoding delivery addresses</p>
            </div>
          </div>
        ) : mapMarkers.length > 0 ? (
          <MapComponent
            accessToken={mapboxToken}
            markers={mapMarkers}
            center={mapCenter}
            height="471px"
            showControls={true}
            onMarkerClick={handleMarkerClick}
          />
          ) : (
          <div className="bg-gray-100 rounded-lg h-[471px] flex items-center justify-center">
            <div className="text-center w-full">
              <MapPin className="w-10 h-10 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">
                {statusFilter === 'all' ? 'No orders on map' : `No ${statusFilter.toLowerCase()} orders`}
              </p>
              <p className="text-sm text-gray-400">Orders with delivery addresses will appear here</p>
            </div>
          </div>
          )}
      </div>

      <MapFullscreenModal open={showFullScreenModal} onClose={() => setShowFullScreenModal(false)} title="Live delivery tracking">
        {isGeocoding && mapMarkers.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center bg-gray-100">
            <div className="text-center">
              <Loader2 className="mx-auto mb-4 h-16 w-16 animate-spin text-gray-400" />
              <p className="text-xl font-medium text-gray-500">Loading map...</p>
              <p className="text-sm text-gray-400">Geocoding delivery addresses</p>
            </div>
          </div>
        ) : mapMarkers.length > 0 ? (
          <MapComponent
            key="orders-gps-fullscreen"
            accessToken={mapboxToken}
            markers={mapMarkers}
            center={mapCenter}
            height="100%"
            className="h-full min-h-0 rounded-none border-0"
            showControls={true}
            onMarkerClick={handleMarkerClick}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gray-100">
            <div className="w-full text-center">
              <MapPin className="mx-auto mb-4 h-12 w-12 text-gray-400" />
              <p className="text-xl font-medium text-gray-500">
                {statusFilter === 'all' ? 'No orders on map' : `No ${statusFilter.toLowerCase()} orders`}
              </p>
              <p className="mt-1 text-sm text-gray-400">Orders with delivery addresses will appear here</p>
            </div>
          </div>
        )}
      </MapFullscreenModal>
    </>
  );
}

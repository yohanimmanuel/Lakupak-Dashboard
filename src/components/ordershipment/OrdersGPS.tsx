'use client';
import React, { useState, useEffect, useMemo, useRef } from "react";
import { MapPin, Maximize2, X, Loader2 } from "lucide-react";
import { Order } from '@/types/order';
import MapComponent from './MapComponent';
import { geocodeMultipleAddresses, GeocodeResult, MapCoordinates, getOrderStatusMarkerColor } from '@/utils/mapboxUtils';

interface OrdersGPSProps {
  orders: Order[];
}

interface MapMarker {
  id: string;
  coordinates: MapCoordinates;
  label: string;
  color: string;
}


export default function OrdersGPS({ orders }: OrdersGPSProps) {
  const [showFullScreenModal, setShowFullScreenModal] = useState(false);
  const [geocodeResults, setGeocodeResults] = useState<Map<string, GeocodeResult>>(new Map());
  const [isGeocoding, setIsGeocoding] = useState(false);
  const geocodedAddressesRef = useRef<Set<string>>(new Set());
  
  const validOrders = Array.isArray(orders) ? orders : [];
  
  const activeDeliveries = validOrders.filter(o => 
    ['Shipped', 'Packed'].includes(o.orderStatus)
  ).length;
  
  const shippedOrders = validOrders.filter(o => o.orderStatus === 'Shipped').length;
  const deliveredOrders = validOrders.filter(o => o.orderStatus === 'Delivered').length;
  const pendingOrders = validOrders.filter(o => o.orderStatus === 'Pending').length;

  const activeOrders = useMemo(() => {
    return validOrders.filter(o => 
      ['Shipped', 'Packed', 'Pending', 'Confirmed'].includes(o.orderStatus) && 
      o.deliveryAddress
    );
  }, [validOrders]);

  useEffect(() => {
    const geocodeAddresses = async () => {
      if (activeOrders.length === 0) return;

      const addresses = activeOrders
        .map(o => o.deliveryAddress)
        .filter((addr, index, self) => self.indexOf(addr) === index && addr);

      const needGeocoding = addresses.filter(addr => !geocodedAddressesRef.current.has(addr));

      if (needGeocoding.length === 0) return;

      needGeocoding.forEach(addr => geocodedAddressesRef.current.add(addr));

      setIsGeocoding(true);
      try {
        const newResults = await geocodeMultipleAddresses(needGeocoding);
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
  }, [activeOrders]);

  const mapMarkers: MapMarker[] = useMemo(() => {
    return activeOrders
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
  }, [activeOrders, geocodeResults]);

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
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Live Delivery Tracking</h3>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <span>{activeDeliveries} Active Deliveries</span>
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
          <div className="bg-gray-100 rounded-lg h-96 flex items-center justify-center">
              <div className="text-center">
              <Loader2 className="w-12 h-12 text-gray-400 mx-auto mb-3 animate-spin" />
              <p className="text-gray-500 font-medium">Loading map...</p>
              <p className="text-sm text-gray-400">Geocoding delivery addresses</p>
            </div>
          </div>
        ) : mapMarkers.length > 0 ? (
          <MapComponent
            markers={mapMarkers}
            center={mapCenter}
              height="400px"
              showControls={true}
            onMarkerClick={handleMarkerClick}
            />
          ) : (
          <div className="bg-gray-100 rounded-lg h-96 flex items-center justify-center">
              <div className="text-center">
                <MapPin className="w-16 h-16 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No active deliveries</p>
              <p className="text-sm text-gray-400">Orders with delivery addresses will appear here</p>
              </div>
            </div>
          )}
        
        {/* Quick Stats Below Map */}
        <div className="grid grid-cols-3 gap-4 mt-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{shippedOrders}</div>
            <div className="text-sm text-gray-600">In Transit</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{deliveredOrders}</div>
            <div className="text-sm text-gray-600">Delivered</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{pendingOrders}</div>
            <div className="text-sm text-gray-600">Pending</div>
          </div>
        </div>
      </div>

      {/* Full Screen Modal */}
      {showFullScreenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative max-w-7xl max-h-[90vh] w-full mx-4 bg-white rounded-lg overflow-hidden">
            {/* Close Button */}
            <button
              onClick={() => setShowFullScreenModal(false)}
              className="absolute top-6 right-6 z-10 p-3 text-gray-500 hover:bg-gray-300 rounded-lg transition-colors"
              aria-label="Close full screen map view"
            >
              <X className="w-8 h-8" />
            </button>
            
            {/* Full Size Map */}
            <div className="w-full h-full min-h-[80vh] p-6">
              {isGeocoding && mapMarkers.length === 0 ? (
                <div className="w-full h-full flex items-center justify-center bg-gray-100 rounded-lg">
                  <div className="text-center">
                    <Loader2 className="w-16 h-16 text-gray-400 mx-auto mb-4 animate-spin" />
                    <p className="text-xl text-gray-500 font-medium">Loading map...</p>
                    <p className="text-sm text-gray-400">Geocoding delivery addresses</p>
                  </div>
                </div>
              ) : mapMarkers.length > 0 ? (
                <MapComponent
                  markers={mapMarkers}
                  center={mapCenter}
                  height="100%"
                  className="min-h-[80vh]"
                  showControls={true}
                  onMarkerClick={handleMarkerClick}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-100 rounded-lg">
                  <div className="text-center">
                    <MapPin className="w-32 h-32 text-gray-400 mx-auto mb-6" />
                    <p className="text-2xl text-gray-500 font-medium">No active deliveries</p>
                    <p className="text-lg text-gray-400">Orders with delivery addresses will appear here</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

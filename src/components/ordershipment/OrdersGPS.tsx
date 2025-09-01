'use client';
import React, { useState } from "react";
import { MapPin, Maximize2, X } from "lucide-react";
import { Order } from '@/types/order';

interface OrdersGPSProps {
  orders: Order[];
}

export default function OrdersGPS({ orders }: OrdersGPSProps) {
  const [showFullScreenModal, setShowFullScreenModal] = useState(false);
  
  // Validate and sanitize input
  const validOrders = Array.isArray(orders) ? orders : [];
  
  // Mock map data - replace with actual map integration
  const activeDeliveries = validOrders.filter(o => 
    ['Shipped', 'Packed'].includes(o.orderStatus)
  ).length;
  
  const shippedOrders = validOrders.filter(o => o.orderStatus === 'Shipped').length;
  const deliveredOrders = validOrders.filter(o => o.orderStatus === 'Delivered').length;
  const pendingOrders = validOrders.filter(o => o.orderStatus === 'Pending').length;

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
        
        {/* Map Placeholder */}
        <div className="bg-gray-100 rounded-lg h-83 flex items-center justify-center">
          <div className="text-center">
            <MapPin className="w-16 h-16 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">Interactive Map</p>
            <p className="text-sm text-gray-400">Real-time delivery tracking</p>
            <p className="text-xs text-gray-400 mt-1">Map integration coming soon</p>
          </div>
        </div>
        
        {/* Quick Stats Below Map */}
        <div className="grid grid-cols-3 gap-4 mt-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{shippedOrders}</div>
            <div className="text-sm text-gray-600">In Transit</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{deliveredOrders}</div>
            <div className="text-sm text-gray-600">Delivered Today</div>
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
            <div className="w-full h-full min-h-[80vh] bg-gray-100 flex items-center justify-center">
              <div className="text-center">
                <MapPin className="w-32 h-32 text-gray-400 mx-auto mb-6" />
                <p className="text-2xl text-gray-500 font-medium">Interactive Map - Full Screen</p>
                <p className="text-lg text-gray-400">Real-time delivery tracking</p>
                <p className="text-sm text-gray-400 mt-2">Map integration coming soon</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Demo component showing shipping fee calculation
 * This would be used in the marketplace checkout flow
 */

import React, { useState } from 'react';
import { MapPin, Calculator, Truck } from 'lucide-react';
import { 
  calculateShippingFee, 
  getShippingFeeBreakdown, 
  formatShippingFee,
  getDefaultShippingConfig,
  type ShippingConfig 
} from '@/utils/shippingCalculation';

interface ShippingFeeDemoProps {
  orderValue?: number;
  onShippingFeeCalculated?: (fee: number) => void;
}

export default function ShippingFeeDemo({ 
  orderValue = 0, 
  onShippingFeeCalculated 
}: ShippingFeeDemoProps) {
  const [distance, setDistance] = useState<number>(25);
  const [config] = useState<ShippingConfig>(getDefaultShippingConfig());
  
  // Calculate shipping fee
  const result = calculateShippingFee(distance, orderValue, config);
  const breakdown = getShippingFeeBreakdown(distance, orderValue, config);
  
  // Notify parent component of calculated fee
  React.useEffect(() => {
    onShippingFeeCalculated?.(result.shippingFee);
  }, [result.shippingFee, onShippingFeeCalculated]);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Truck className="w-5 h-5 text-blue-600" />
        <h3 className="text-lg font-semibold text-gray-900">Shipping Fee Calculator</h3>
      </div>

      {/* Distance Input */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Delivery Distance (km)
        </label>
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-gray-400" />
          <input
            type="number"
            value={distance}
            onChange={(e) => setDistance(Number(e.target.value) || 0)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Enter distance in km"
            min="0"
            step="0.1"
          />
        </div>
      </div>

      {/* Shipping Configuration Display */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Shipping Configuration</h4>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Base Radius:</span>
            <span className="ml-2 font-medium">{config.baseShippingRadius} km</span>
          </div>
          <div>
            <span className="text-gray-600">Base Price:</span>
            <span className="ml-2 font-medium">{formatShippingFee(config.baseShippingPrice)}</span>
          </div>
          <div>
            <span className="text-gray-600">Additional per km:</span>
            <span className="ml-2 font-medium">{formatShippingFee(config.additionalPricePerKm)}</span>
          </div>
          <div>
            <span className="text-gray-600">Max Radius:</span>
            <span className="ml-2 font-medium">{config.maxShippingRadius} km</span>
          </div>
        </div>
      </div>

      {/* Calculation Breakdown */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Calculator className="w-4 h-4 text-green-600" />
          <h4 className="text-sm font-semibold text-gray-700">Calculation Breakdown</h4>
        </div>
        
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Base Price ({breakdown.baseRadius} km):</span>
            <span className="font-medium">{formatShippingFee(breakdown.basePrice)}</span>
          </div>
          
          {breakdown.additionalDistance > 0 && (
            <>
              <div className="flex justify-between">
                <span className="text-gray-600">Additional Distance:</span>
                <span className="font-medium">{breakdown.additionalDistance.toFixed(1)} km</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Additional Cost:</span>
                <span className="font-medium">{formatShippingFee(breakdown.additionalCost)}</span>
              </div>
            </>
          )}
          
          <div className="border-t border-gray-200 pt-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Total Shipping Fee:</span>
              <span className="font-semibold text-lg">
                {formatShippingFee(breakdown.totalFee)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Status Messages */}
      {result.isFreeShipping && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-700 text-sm font-medium">
            🎉 Free shipping! Order value meets the threshold.
          </p>
        </div>
      )}
      
      {!result.isWithinMaxRadius && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 text-sm font-medium">
            ⚠️ Distance exceeds maximum delivery radius ({config.maxShippingRadius} km).
          </p>
        </div>
      )}

      {/* Order Summary */}
      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <h4 className="text-sm font-semibold text-blue-900 mb-2">Order Summary</h4>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-blue-700">Subtotal:</span>
            <span className="font-medium">{formatShippingFee(orderValue)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-blue-700">Shipping:</span>
            <span className="font-medium">{formatShippingFee(result.shippingFee)}</span>
          </div>
          <div className="border-t border-blue-200 pt-1">
            <div className="flex justify-between">
              <span className="text-blue-900 font-semibold">Total:</span>
              <span className="font-bold text-lg">{formatShippingFee(orderValue + result.shippingFee)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

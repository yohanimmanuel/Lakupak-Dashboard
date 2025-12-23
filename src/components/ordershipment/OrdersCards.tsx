'use client';
import React, { useState, useEffect } from "react";
import { Package, CheckCircle, Clock, DollarSign, TrendingUp, TrendingDown } from "lucide-react";
import { Order } from '@/types/order';
import { formatNumber } from '@/utils/dateUtils';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';
import { calculateOrderTotalAmount } from '@/utils/orderCalculations';
import { useUserStore } from '@/store/userStore';

interface OrdersCardsProps {
  orders: Order[];
}

export default function OrdersCards({ orders }: OrdersCardsProps) {
  const user = useUserStore(state => state.user);
  
  // Validate and sanitize input
  const validOrders = Array.isArray(orders) ? orders : [];
  
  // Calculate stats with error handling
  const totalOrders = validOrders.length;
  const pendingOrders = validOrders.filter(o => o.orderStatus === 'Pending').length;
  const deliveredOrders = validOrders.filter(o => o.orderStatus === 'Delivered').length;
  
  const totalRevenue = validOrders.reduce((sum, order) => {
    return sum + calculateOrderTotalAmount(order);
  }, 0);
  
  const pendingRevenue = validOrders
    .filter(o => o.paymentStatus === 'Unpaid')
    .reduce((sum, order) => {
      return sum + calculateOrderTotalAmount(order);
    }, 0);
  
  // Use user's currency or server default (only on client)
  const displayCurrency = user?.currency || getDefaultCurrency();

  return (
    <div className="space-y-4">
      {/* Total Orders */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-600">Total Orders</p>
            <p className="text-xl font-bold text-gray-900">{totalOrders}</p>
          </div>
          <div className="p-3 shadow-sm bg-white rounded-lg">
            <Package className="w-6 h-6 text-blue-600" />
          </div>
        </div>
        <div className="flex items-center mt-4">
          <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
          <span className="text-xs text-green-600 font-medium">+12.5%</span>
          <span className="text-xs text-gray-500 ml-1">from last month</span>
        </div>
      </div>

      {/* Total Revenue */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-600">Total Revenue</p>
            <p className="text-xl font-bold text-gray-900">
              {formatCurrency(totalRevenue, displayCurrency)}
            </p>
          </div>
          <div className="p-3 bg-white shadow-sm rounded-lg">
            <DollarSign className="w-6 h-6 text-green-600" />
          </div>
        </div>
        <div className="flex items-center mt-4">
          <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
          <span className="text-xs text-green-600 font-medium">+8.2%</span>
          <span className="text-xs text-gray-500 ml-1">from last month</span>
        </div>
      </div>

      {/* Pending Revenue */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-600">Pending Revenue</p>
            <p className="text-xl font-bold text-gray-900">
              {formatCurrency(pendingRevenue, displayCurrency)}
            </p>
          </div>
          <div className="p-3 bg-white shadow-sm rounded-lg">
            <Clock className="w-6 h-6 text-orange-600" />
          </div>
        </div>
        <div className="flex items-center mt-4">
          <TrendingDown className="w-4 h-4 text-red-500 mr-1" />
          <span className="text-xs text-red-600 font-medium">-2.1%</span>
          <span className="text-xs text-gray-500 ml-1">from last month</span>
        </div>
      </div>

      {/* Delivery Success Rate */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-600">Delivery Success</p>
            <p className="text-xl font-bold text-gray-900">
              {totalOrders > 0 ? Math.round((deliveredOrders / totalOrders) * 100) : 0}%
            </p>
          </div>
          <div className="p-3 bg-white shadow-sm rounded-lg">
            <CheckCircle className="w-6 h-6 text-purple-600" />
          </div>
        </div>
        <div className="flex items-center mt-4">
          <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
          <span className="text-xs text-green-600 font-medium">+5.3%</span>
          <span className="text-xs text-gray-500 ml-1">from last month</span>
        </div>
      </div>
    </div>
  );
}

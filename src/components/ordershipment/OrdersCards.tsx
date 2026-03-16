'use client';
import React, { useMemo } from "react";
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
  
  const unpaidRevenue = validOrders
    .filter(o => o.paymentStatus === 'Unpaid')
    .reduce((sum, order) => {
      return sum + calculateOrderTotalAmount(order);
    }, 0);
  
  const revenueCollected = totalRevenue - unpaidRevenue;

  // Month-over-month growth metrics based on order totals
  const growth = useMemo(() => {
    const safeOrders = Array.isArray(orders) ? orders : [];
    if (!safeOrders.length) {
      return {
        ordersGrowth: 0,
        totalRevenueGrowth: 0,
        collectedGrowth: 0,
        pendingGrowth: 0,
        successGrowth: 0,
      };
    }

    const byMonth: Record<string, { orders: number; totalRevenue: number; unpaidRevenue: number; delivered: number }> = {};

    safeOrders.forEach(order => {
      const d = new Date(order.orderDate);
      if (Number.isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!byMonth[key]) {
        byMonth[key] = { orders: 0, totalRevenue: 0, unpaidRevenue: 0, delivered: 0 };
      }
      const bucket = byMonth[key];
      bucket.orders += 1;
      const amount = calculateOrderTotalAmount(order);
      bucket.totalRevenue += amount;
      if (order.paymentStatus === 'Unpaid') {
        bucket.unpaidRevenue += amount;
      }
      if (order.orderStatus === 'Delivered') {
        bucket.delivered += 1;
      }
    });

    const keys = Object.keys(byMonth).sort();
    if (keys.length < 2) {
      return {
        ordersGrowth: 0,
        totalRevenueGrowth: 0,
        collectedGrowth: 0,
        pendingGrowth: 0,
        successGrowth: 0,
      };
    }

    const last = byMonth[keys[keys.length - 1]];
    const prev = byMonth[keys[keys.length - 2]];

    const collectedLast = last.totalRevenue - last.unpaidRevenue;
    const collectedPrev = prev.totalRevenue - prev.unpaidRevenue;

    const ordersGrowth =
      prev.orders > 0 ? ((last.orders - prev.orders) / prev.orders) * 100 : 0;
    const totalRevenueGrowth =
      prev.totalRevenue > 0
        ? ((last.totalRevenue - prev.totalRevenue) / prev.totalRevenue) * 100
        : 0;
    const collectedGrowth =
      collectedPrev > 0
        ? ((collectedLast - collectedPrev) / collectedPrev) * 100
        : 0;
    const pendingGrowth =
      prev.unpaidRevenue > 0
        ? ((last.unpaidRevenue - prev.unpaidRevenue) / prev.unpaidRevenue) * 100
        : 0;

    const successLast = last.orders > 0 ? (last.delivered / last.orders) * 100 : 0;
    const successPrev = prev.orders > 0 ? (prev.delivered / prev.orders) * 100 : 0;
    const successGrowth =
      successPrev !== 0
        ? ((successLast - successPrev) / Math.abs(successPrev)) * 100
        : 0;

    return {
      ordersGrowth,
      totalRevenueGrowth,
      collectedGrowth,
      pendingGrowth,
      successGrowth,
    };
  }, [orders]);
  
  // Use user's currency or server default (only on client)
  const displayCurrency = user?.currency || getDefaultCurrency();

  return (
    <div className="space-y-3">
      {/* Total Orders */}
      <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-600">Total Orders</p>
            <p className="text-xl font-bold text-gray-900">{totalOrders}</p>
          </div>
          <div className="p-3 bg-white rounded-lg border border-[#e6e6e6]">
            <Package className="w-6 h-6 text-blue-600" />
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4 ml-1">
          {growth.ordersGrowth >= 0 ? (
            <TrendingUp className="w-5 h-5 text-[#3ea73b]" />
          ) : (
            <TrendingDown className="w-5 h-5 text-[#f65911]" />
          )}
          <span
            className={
              growth.ordersGrowth >= 0
                ? "text-[#3ea73b] text-xs font-semibold"
                : "text-[#f65911] text-xs font-semibold"
            }
          >
            {Math.abs(growth.ordersGrowth).toFixed(1)}%
          </span>
          <span className="text-gray-400 text-xs">from last month</span>
        </div>
      </div>

      {/* Total Sales */}
      <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-600">Total Sales</p>
            <p className="text-xl font-bold text-gray-900">
              {formatCurrency(totalRevenue, displayCurrency)}
            </p>
          </div>
          <div className="p-3 bg-white rounded-lg border border-[#e6e6e6]">
            <DollarSign className="w-6 h-6 text-blue-600" />
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4 ml-1">
          {growth.totalRevenueGrowth >= 0 ? (
            <TrendingUp className="w-5 h-5 text-[#3ea73b]" />
          ) : (
            <TrendingDown className="w-5 h-5 text-[#f65911]" />
          )}
          <span
            className={
              growth.totalRevenueGrowth >= 0
                ? "text-[#3ea73b] text-xs font-semibold"
                : "text-[#f65911] text-xs font-semibold"
            }
          >
            {Math.abs(growth.totalRevenueGrowth).toFixed(1)}%
          </span>
          <span className="text-gray-400 text-xs">from last month</span>
        </div>
      </div>

      {/* Revenue Collected */}
      <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-600">Revenue Collected</p>
            <p className="text-xl font-bold text-gray-900">
              {formatCurrency(revenueCollected, displayCurrency)}
            </p>
          </div>
          <div className="p-3 bg-white rounded-lg border border-[#e6e6e6]">
            <CheckCircle className="w-6 h-6 text-green-600" />
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4 ml-1">
          {growth.collectedGrowth >= 0 ? (
            <TrendingUp className="w-5 h-5 text-[#3ea73b]" />
          ) : (
            <TrendingDown className="w-5 h-5 text-[#f65911]" />
          )}
          <span
            className={
              growth.collectedGrowth >= 0
                ? "text-[#3ea73b] text-xs font-semibold"
                : "text-[#f65911] text-xs font-semibold"
            }
          >
            {Math.abs(growth.collectedGrowth).toFixed(1)}%
          </span>
          <span className="text-gray-400 text-xs">from last month</span>
        </div>
      </div>

      {/* Pending Revenue */}
      <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-600">Pending Revenue</p>
            <p className="text-xl font-bold text-gray-900">
              {formatCurrency(unpaidRevenue, displayCurrency)}
            </p>
          </div>
          <div className="p-3 bg-white rounded-lg border border-[#e6e6e6]">
            <Clock className="w-6 h-6 text-orange-600" />
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4 ml-1">
          {growth.pendingGrowth >= 0 ? (
            <TrendingDown className="w-5 h-5 text-[#f65911]" />
          ) : (
            <TrendingUp className="w-5 h-5 text-[#3ea73b]" />
          )}
          <span
            className={
              growth.pendingGrowth >= 0
                ? "text-[#f65911] text-xs font-semibold"
                : "text-[#3ea73b] text-xs font-semibold"
            }
          >
            {Math.abs(growth.pendingGrowth).toFixed(1)}%
          </span>
          <span className="text-gray-400 text-xs">from last month</span>
        </div>
      </div>

      {/* Delivery Success Rate */}
      <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-600">Delivery Success</p>
            <p className="text-xl font-bold text-gray-900">
              {totalOrders > 0 ? Math.round((deliveredOrders / totalOrders) * 100) : 0}%
            </p>
          </div>
          <div className="p-3 bg-white rounded-lg border border-[#e6e6e6]">
            <CheckCircle className="w-6 h-6 text-purple-600" />
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4 ml-1">
          {growth.successGrowth >= 0 ? (
            <TrendingUp className="w-5 h-5 text-[#3ea73b]" />
          ) : (
            <TrendingDown className="w-5 h-5 text-[#f65911]" />
          )}
          <span
            className={
              growth.successGrowth >= 0
                ? "text-[#3ea73b] text-xs font-semibold"
                : "text-[#f65911] text-xs font-semibold"
            }
          >
            {Math.abs(growth.successGrowth).toFixed(1)}%
          </span>
          <span className="text-gray-400 text-xs">from last month</span>
        </div>
      </div>
    </div>
  );
}

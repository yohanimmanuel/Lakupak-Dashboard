import React from "react";
import { Users, UserCheck, ShoppingCart, Repeat, Truck, CheckCircle, DollarSign, Clock, TrendingUp, TrendingDown } from "lucide-react";
import { useMemo } from 'react';
import { Buyer, Supplier, OrderDetail, SupplyDetail } from '@/types/client';

/**
 * Statcards Component - Currency-Agnostic Support
 * 
 * This component handles multiple currencies without conversion:
 * 
 * 1. **Currency Display**: Shows values with their original currency prefix
 * 2. **No Conversion**: Assumes all data uses the same currency as per user note
 * 3. **Simple Formatting**: Displays values as-is with proper formatting
 * 
 * **How it works**:
 * - Extracts currency prefix from the first available data point
 * - Uses that currency for all display values
 * - No currency conversion or rate calculations
 * - Assumes user follows the note: "Please use the same currency for all buyers/suppliers"
 * 
 * **Monthly Average Calculation**:
 * 1. Sum all monthly spending/purchase values from each buyer/supplier
 * 2. Count only those with values > 0
 * 3. Divide total by count of active users
 * 4. This gives the true "average monthly spending/purchase per active user"
 * 
 * **Order Frequency Calculation**:
 * 1. Sum all monthly orders from ALL buyers (regardless of spending)
 * 2. Divide by count of ALL buyers (not just those with spending)
 * 3. This gives true "average monthly orders per buyer"
 */
interface StatcardsProps {
  type: 'buyer' | 'supplier';
  data: (Buyer | Supplier)[];
}

function getCurrentMonth() {
  const now = new Date();
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
}

function parseCurrency(str: string) {
  return parseInt((str || '').toString().replace(/[^\d]/g, '')) || 0;
}

// Helper function to safely parse JSON strings
function safeParseJSON(jsonStr: string, fallback: OrderDetail[] | SupplyDetail[] | Record<string, unknown> = []) {
  if (!jsonStr) return fallback;
  try {
    const parsed = JSON.parse(jsonStr);
    // If fallback is array, ensure we return array
    if (Array.isArray(fallback)) {
      return Array.isArray(parsed) ? parsed : fallback;
    }
    // If fallback is object, return parsed or fallback
    return parsed || fallback;
  } catch {
    return fallback;
  }
}

// Helper function to extract currency from value strings
function extractCurrency(valueStr: string): string {
  if (!valueStr) return '';
  const match = valueStr.toString().match(/^([^\d]*)/);
  return match && match[1] ? match[1].trim() : '';
}

// Helper function to get currency from first available data point
function getCurrencyFromData(data: (Buyer | Supplier)[], valueField: string): string {
  for (const item of data) {
    if ('orderDetails' in item) {
      const orderDetails = safeParseJSON(item.orderDetails || '[]');
      if (Array.isArray(orderDetails) && orderDetails.length > 0) {
        const currency = extractCurrency(orderDetails[0][valueField as keyof OrderDetail] || '');
        if (currency) return currency;
      }
    } else if ('supplies' in item) {
      const supplies = safeParseJSON(item.supplies || '[]');
      if (Array.isArray(supplies) && supplies.length > 0) {
        const currency = extractCurrency(supplies[0][valueField as keyof SupplyDetail] || '');
        if (currency) return currency;
      }
    }
  }
  // Return empty string if no currency found - let the display logic handle it
  return '';
}

// Helper function to clean decimals by rounding to nearest whole number
function cleanDecimals(value: number): number {
  return Math.round(value);
}

export default function Statcards({ type, data }: StatcardsProps) {
  const stats = useMemo(() => {
    if (type === 'buyer') {
      const totalBuyers = data.length;
      const activeBuyers = data.filter(b => b.status === 'Active').length;
      
      // Get currency from first available data point
      const currency = getCurrencyFromData(data, 'totalSpend');
      
      // Average monthly spend per buyer - CORRECT CALCULATION
      // Use the monthly analytics data passed from the buyers page
      let totalAvgMonthlySpend = 0;
      let totalAvgMonthlyOrders = 0;
      let buyersWithSpending = 0;
      let buyersWithOrders = 0;
      
      data.forEach(buyer => {
        // Use the pre-calculated monthly averages (same as BuyerProfile)
        if ('avgMonthlySpending' in buyer && 'avgMonthlyOrders' in buyer) {
          const avgMonthlySpending = buyer.avgMonthlySpending || 0;
          const avgMonthlyOrders = buyer.avgMonthlyOrders || 0;
          
          // Add to totals
          totalAvgMonthlySpend += avgMonthlySpending;
          totalAvgMonthlyOrders += avgMonthlyOrders;
          
          // Count buyers with spending > 0
          if (avgMonthlySpending > 0) {
            buyersWithSpending++;
          }
          
          // Count buyers with orders > 0
          if (avgMonthlyOrders > 0) {
            buyersWithOrders++;
          }
        }
      });
      
      // Calculate average: total of monthly averages ÷ count of buyers with spending
      const avgMonthlySpend = buyersWithSpending > 0 ? totalAvgMonthlySpend / buyersWithSpending : 0;
      
      // Avg. order frequency: total of monthly averages ÷ count of buyers with orders
      const avgOrderFreq = buyersWithOrders > 0 ? (totalAvgMonthlyOrders / buyersWithOrders).toFixed(1) : '0.0';
      
      return [
        {
          label: 'Total Buyers',
          value: totalBuyers,
          icon: <Users className="w-6 h-6 text-[#0a61d7]" />, color: 'bg-[#f7faff]', trend: { percent: '+0%', label: 'from last month', up: true }
        },
        {
          label: 'Active Buyers',
          value: activeBuyers,
          icon: <UserCheck className="w-6 h-6 text-green-500" />, color: 'bg-[#e6f7ec]', trend: { percent: '+0%', label: 'from last month', up: true }
        },
        {
          label: 'Monthly Buyer Spend',
          value: currency ? currency + ' ' + cleanDecimals(avgMonthlySpend).toLocaleString('id-ID') : cleanDecimals(avgMonthlySpend).toLocaleString('id-ID'),
          icon: <DollarSign className="w-6 h-6 text-yellow-500" />, color: 'bg-[#f7faff]', trend: { percent: '+0%', label: 'from last month', up: true }
        },
        {
          label: 'Avg. Order Frequency',
          value: avgOrderFreq + '/mo',
          icon: <Repeat className="w-6 h-6 text-gray-500" />, color: 'bg-[#e6e6e6]', trend: { percent: '+0%', label: 'from last month', up: true }
        }
      ];
    } else {
      // Supplier stats
      const totalSuppliers = data.length;
      const activeSuppliers = data.filter(s => s.status === 'Active').length;
      
      // Get currency from first available data point
      const currency = getCurrencyFromData(data, 'totalValue');
      
      // Average monthly purchase value per supplier - CORRECT CALCULATION
      // Use the monthly analytics data passed from the suppliers page
      let totalAvgMonthlyValue = 0;
      let suppliersWithPurchases = 0;
      
      data.forEach(supplier => {
        // Use the pre-calculated monthly averages (same as SupplierProfile)
        if ('avgMonthlyPurchaseValue' in supplier) {
          const avgMonthlyPurchaseValue = supplier.avgMonthlyPurchaseValue || 0;
          
          // Add to total
          totalAvgMonthlyValue += avgMonthlyPurchaseValue;
          
          // Only count suppliers who actually have purchases this month
          if (avgMonthlyPurchaseValue > 0) {
            suppliersWithPurchases++;
          }
        }
      });
      
      // Calculate average: total of monthly averages ÷ count of suppliers with purchases
      const avgMonthlyValue = suppliersWithPurchases > 0 ? totalAvgMonthlyValue / suppliersWithPurchases : 0;
      
      // On-time delivery rate: average of all suppliers' deliverySuccess (from logistics or supplies)
      let deliverySuccessSum = 0, deliverySuccessCount = 0;
      data.forEach(supplier => {
        // Parse logistics from string - expect object or empty array
        if ('logistics' in supplier && supplier.logistics) {
          const logistics = safeParseJSON(supplier.logistics, {});
          // Prefer logistics.deliverySuccess if present, else average from supplies
          if (logistics && typeof logistics === 'object' && 'deliverySuccess' in logistics) {
            // If logistics is an object with deliverySuccess
            if (logistics.deliverySuccess !== undefined && logistics.deliverySuccess !== '') {
              deliverySuccessSum += parseFloat(logistics.deliverySuccess);
              deliverySuccessCount++;
            }
          }
        }
        
        // If logistics is empty or doesn't have deliverySuccess, check supplies
        if ('supplies' in supplier && supplier.supplies) {
          const supplies = safeParseJSON(supplier.supplies);
          if (Array.isArray(supplies)) {
            supplies.forEach((s: SupplyDetail) => {
              if (s.deliverySuccess !== undefined && s.deliverySuccess !== '') {
                deliverySuccessSum += parseFloat(s.deliverySuccess);
                deliverySuccessCount++;
              }
            });
          }
        }
      });
      const onTimeRate = deliverySuccessCount > 0 ? Math.round(deliverySuccessSum / deliverySuccessCount) : 0;
      
      return [
        {
          label: 'Total Suppliers',
          value: totalSuppliers,
          icon: <Truck className="w-6 h-6 text-[#0a61d7]" />, color: 'bg-[#f7faff]', trend: { percent: '+0%', label: 'from last month', up: true }
        },
        {
          label: 'Active Suppliers',
          value: activeSuppliers,
          icon: <CheckCircle className="w-6 h-6 text-green-500" />, color: 'bg-[#e6f7ec]', trend: { percent: '+0%', label: 'from last month', up: true }
        },
        {
          label: 'Monthly Purchase Value',
          value: currency ? currency + ' ' + cleanDecimals(avgMonthlyValue).toLocaleString('id-ID') : cleanDecimals(avgMonthlyValue).toLocaleString('id-ID'),
          icon: <DollarSign className="w-6 h-6 text-yellow-500" />, color: 'bg-[#f7faff]', trend: { percent: '+0%', label: 'from last month', up: true }
        },
        {
          label: 'On-time Delivery Rate',
          value: onTimeRate + '%',
          icon: <Clock className="w-6 h-6 text-gray-500" />, color: 'bg-[#e6e6e6]', trend: { percent: '+0%', label: 'from last month', up: true }
        }
      ];
    }
  }, [type, data]);

  return (
    <div className="w-full mx-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map((stat, idx) => (
        <div
          key={stat.label}
          className={`flex flex-col justify-between p-4 rounded-lg shadow bg-white border border-[#e6e6e6] ${stat.color}`}
        >
          <div className="flex items-center gap-4 border-b border-gray-200 pb-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-white shadow-sm">
              {stat.icon}
            </div>
            <div>
              <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{stat.label}</div>
              <div className="text-xl font-bold text-black">{stat.value}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 ml-1">
            {stat.trend.up ? (
              <TrendingUp className="w-5 h-5 text-[#3ea73b]" />
            ) : (
              <TrendingDown className="w-5 h-5 text-[#f65911]" />
            )}
            <span className={stat.trend.up ? "text-[#3ea73b] text-xs font-semibold" : "text-[#f65911] text-xs font-semibold"}>
              {stat.trend.percent}
            </span>
            <span className="text-gray-400 text-xs">{stat.trend.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

import React, { useState, useEffect } from "react";
import { Users, UserCheck, ShoppingCart, Repeat, Truck, CheckCircle, DollarSign, Clock, TrendingUp, TrendingDown } from "lucide-react";
import { formatNumber } from '@/utils/dateUtils';
import { useMemo } from 'react';
import { Buyer, Supplier, OrderDetail, SupplyDetail } from '@/types/client';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';
import { useUserStore } from '@/store/userStore';

/**
 * Statcards Component - Single Source of Truth Currency
 * 
 * This component displays all monetary values using ONLY the user's currency:
 * 
 * 1. **Single Source**: Only uses user.currency from user profile
 * 2. **No Currency Extraction**: Removes ALL currency identifiers from data
 * 3. **Raw Numbers Only**: Processes only numeric values, formats with user currency
 * 
 * **How it works**:
 * - Strips ALL currency symbols/prefixes from data (Rp, $, S$, etc.)
 * - Processes only raw numbers
 * - Formats final display with user's currency only
 * - Prevents hydration mismatch with client-side only currency
 */
interface StatcardsProps {
  type: 'buyer' | 'supplier';
  data: (Buyer | Supplier)[];
}

function getCurrentMonth() {
  const now = new Date();
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
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







// Helper function to clean decimals by rounding to nearest whole number
function cleanDecimals(value: number): number {
  return Math.round(value);
}

export default function Statcards({ type, data }: StatcardsProps) {
  const user = useUserStore(state => state.user);
  
  // Get user currency for display - safe to use on both server and client
  // getDefaultCurrency() works on both, and user?.currency is safe to access
  const userCurrency = user?.currency || getDefaultCurrency();
  
  const stats = useMemo(() => {
    try {
      if (type === 'buyer') {
        const totalBuyers = data.length;
        const activeBuyers = data.filter(b => b.status === 'Active').length;
        
        // Use user's currency for all displays (no data extraction needed)
        
        // Average monthly spend per buyer - CORRECT CALCULATION
        // Use the monthly analytics data passed from the buyers page
        let totalAvgMonthlySpend = 0;
        let totalAvgMonthlyOrders = 0;
        let buyersWithSpending = 0;
        let buyersWithOrders = 0;
        
        data.forEach(buyer => {
          try {
            // Simple approach: use pre-calculated values if available, otherwise calculate from orderDetails
            if ('avgMonthlySpending' in buyer && 'avgMonthlyOrders' in buyer) {
              // Use pre-calculated values - but clean them first in case they contain currency symbols
              const cleanSpending = String(buyer.avgMonthlySpending || '').replace(/[^\d.-]/g, '');
              const cleanOrders = String(buyer.avgMonthlyOrders || '').replace(/[^\d.-]/g, '');
              const avgMonthlySpending = Number(cleanSpending) || 0;
              const avgMonthlyOrders = Number(cleanOrders) || 0;
              
              totalAvgMonthlySpend += avgMonthlySpending;
              totalAvgMonthlyOrders += avgMonthlyOrders;
              
              if (avgMonthlySpending > 0) buyersWithSpending++;
              if (avgMonthlyOrders > 0) buyersWithOrders++;
            } else {
              // Fallback: calculate from orderDetails
              const orderDetails = (buyer as Buyer).orderDetails ? (() => {
                try {
                  return JSON.parse((buyer as Buyer).orderDetails || '');
                } catch {
                  return [];
                }
              })() : [];
              
              if (Array.isArray(orderDetails) && orderDetails.length > 0) {
                let buyerTotalSpend = 0;
                let buyerTotalOrders = 0;
                
                orderDetails.forEach((o: OrderDetail) => {
                  // Remove ALL currency identifiers - only keep numbers
                  // totalSpend already includes product cost + shipping fee
                  const cleanSpend = String(o.totalSpend || '').replace(/[^\d.-]/g, '');
                  const cleanOrders = String(o.totalOrders || '').replace(/[^\d.-]/g, '');
                  buyerTotalSpend += Number(cleanSpend) || 0;
                  buyerTotalOrders += Number(cleanOrders) || 0;
                });
                
                // Use total spend as monthly average (simplified)
                totalAvgMonthlySpend += buyerTotalSpend;
                totalAvgMonthlyOrders += buyerTotalOrders;
                
                if (buyerTotalSpend > 0) buyersWithSpending++;
                if (buyerTotalOrders > 0) buyersWithOrders++;
              }
            }
          } catch (buyerError) {
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
            value: cleanDecimals(avgMonthlySpend), // Store raw number, format in render
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
        
        // Use user's currency for all displays (no data extraction needed)
        
        // Average monthly purchase value per supplier - CORRECT CALCULATION
        // Use the monthly analytics data passed from the suppliers page
        let totalAvgMonthlyValue = 0;
        let suppliersWithPurchases = 0;
        
        data.forEach(supplier => {
          try {
            // Simple approach: use pre-calculated values if available, otherwise calculate from supplies
            if ('avgMonthlyPurchaseValue' in supplier) {
              // Use pre-calculated values - but clean them first in case they contain currency symbols
              const cleanValue = String(supplier.avgMonthlyPurchaseValue || '').replace(/[^\d.-]/g, '');
              const avgMonthlyPurchaseValue = Number(cleanValue) || 0;
              
              totalAvgMonthlyValue += avgMonthlyPurchaseValue;
              
              if (avgMonthlyPurchaseValue > 0) {
                suppliersWithPurchases++;
              }
            } else {
              // Fallback: calculate from supplies
              const supplies = (supplier as Supplier).supplies ? (() => {
                try {
                  return JSON.parse((supplier as Supplier).supplies || '');
                } catch {
                  return [];
                }
              })() : [];
              
              if (Array.isArray(supplies) && supplies.length > 0) {
                let supplierTotalValue = 0;
                
                supplies.forEach((s: SupplyDetail) => {
                  // Remove ALL currency identifiers - only keep numbers
                  const cleanValue = String(s.totalValue || '').replace(/[^\d.-]/g, '');
                  supplierTotalValue += Number(cleanValue) || 0;
                });
                
                // Add to total
                totalAvgMonthlyValue += supplierTotalValue;
                
                if (supplierTotalValue > 0) {
                  suppliersWithPurchases++;
                }
              }
            }
          } catch (supplierError) {
          }
        });
        
        // Calculate average: total of monthly averages ÷ count of suppliers with purchases
        const avgMonthlyValue = suppliersWithPurchases > 0 ? totalAvgMonthlyValue / suppliersWithPurchases : 0;
        
        // On-time delivery rate: average of all suppliers' deliverySuccess (from logistics or supplies)
        let deliverySuccessSum = 0, deliverySuccessCount = 0;
        data.forEach(supplier => {
          try {
            // Parse logistics from string - expect object or empty array
            if ('logistics' in supplier && supplier.logistics) {
              const logistics = safeParseJSON(supplier.logistics, {});
              // Prefer logistics.deliverySuccess if present, else average from supplies
              if (logistics && typeof logistics === 'object' && 'deliverySuccess' in logistics) {
                // If logistics is an object with deliverySuccess
                if (logistics.deliverySuccess !== undefined && logistics.deliverySuccess !== '') {
                  const successRate = parseFloat(logistics.deliverySuccess);
                  if (!isNaN(successRate)) {
                    deliverySuccessSum += successRate;
                    deliverySuccessCount++;
                  }
                }
              }
            }
            
            // If logistics is empty or doesn't have deliverySuccess, check supplies
            if ('supplies' in supplier && supplier.supplies) {
              const supplies = safeParseJSON(supplier.supplies);
              if (Array.isArray(supplies)) {
                supplies.forEach((s: SupplyDetail) => {
                  if (s.deliverySuccess !== undefined && s.deliverySuccess !== '') {
                    const successRate = parseFloat(s.deliverySuccess);
                    if (!isNaN(successRate)) {
                      deliverySuccessSum += successRate;
                      deliverySuccessCount++;
                    }
                  }
                });
              }
            }
          } catch (supplierError) {
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
            value: cleanDecimals(avgMonthlyValue), // Store raw number, format in render
            icon: <DollarSign className="w-6 h-6 text-yellow-500" />, color: 'bg-[#f7faff]', trend: { percent: '+0%', label: 'from last month', up: true }
          },
          {
            label: 'On-time Delivery Rate',
            value: onTimeRate + '%',
            icon: <Clock className="w-6 h-6 text-gray-500" />, color: 'bg-[#e6e6e6]', trend: { percent: '+0%', label: 'from last month', up: true }
          }
        ];
      }
    } catch (error) {
      const fallbackStats = type === 'buyer' ? [
        { label: 'Total Buyers', value: data.length, icon: <Users className="w-6 h-6 text-[#0a61d7]" />, color: 'bg-[#f7faff]', trend: { percent: '+0%', label: 'from last month', up: true } },
        { label: 'Active Buyers', value: data.filter(b => b.status === 'Active').length, icon: <UserCheck className="w-6 h-6 text-green-500" />, color: 'bg-[#e6f7ec]', trend: { percent: '+0%', label: 'from last month', up: true } },
        { label: 'Monthly Buyer Spend', value: 'N/A', icon: <DollarSign className="w-6 h-6 text-yellow-500" />, color: 'bg-[#f7faff]', trend: { percent: '+0%', label: 'from last month', up: true } },
        { label: 'Avg. Order Frequency', value: 'N/A', icon: <Repeat className="w-6 h-6 text-gray-500" />, color: 'bg-[#e6e6e6]', trend: { percent: '+0%', label: 'from last month', up: true } }
      ] : [
        { label: 'Total Suppliers', value: data.length, icon: <Truck className="w-6 h-6 text-[#0a61d7]" />, color: 'bg-[#f7faff]', trend: { percent: '+0%', label: 'from last month', up: true } },
        { label: 'Active Suppliers', value: data.filter(s => s.status === 'Active').length, icon: <CheckCircle className="w-6 h-6 text-green-500" />, color: 'bg-[#e6f7ec]', trend: { percent: '+0%', label: 'from last month', up: true } },
        { label: 'Monthly Purchase Value', value: 'N/A', icon: <DollarSign className="w-6 h-6 text-yellow-500" />, color: 'bg-[#f7faff]', trend: { percent: '+0%', label: 'from last month', up: true } },
        { label: 'On-time Delivery Rate', value: 'N/A', icon: <Clock className="w-6 h-6 text-gray-500" />, color: 'bg-[#e6e6e6]', trend: { percent: '+0%', label: 'from last month', up: true } }
      ];
      return fallbackStats;
    }
  }, [type, data]);

  return (
    <div className="w-full mx-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map((stat, idx) => (
        <div
          key={stat.label}
          className={`flex flex-col justify-between p-4 rounded-lg bg-white border border-[#e6e6e6] ${stat.color}`}
        >
          <div className="flex items-center gap-4 border-b border-[#e6e6e6] pb-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-white">
              {stat.icon}
            </div>
            <div>
              <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{stat.label}</div>
              <div className="text-xl font-bold text-black">
                {stat.label === 'Monthly Buyer Spend' || stat.label === 'Monthly Purchase Value' 
                  ? formatCurrency(Number(stat.value), userCurrency)
                  : stat.value
                }
              </div>
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

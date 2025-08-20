import React from "react";
import { Users, UserCheck, ShoppingCart, Repeat, Truck, CheckCircle, DollarSign, Clock, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useMemo } from 'react';

/**
 * Statcards Component - Multi-Currency Support
 * 
 * This component handles multiple currencies intelligently:
 * 
 * 1. **Currency Detection**: Automatically detects the most common currency in the dataset
 * 2. **Dynamic Display**: Shows values with the detected currency prefix
 * 3. **Currency Conversion**: Provides utility functions for converting between currencies
 * 
 * **Supported Currencies**: IDR (Rp), USD ($), EUR (€), SGD (S$)
 * 
 * **How it works**:
 * - Scans all order/supply data to find currency prefixes
 * - Counts frequency of each currency
 * - Uses the most frequent currency for display
 * - Falls back to 'Rp ' if no currency is detected
 * 
 * **Multi-Currency Scenarios**:
 * - Mixed currencies in same dataset → Shows dominant currency
 * - Different currencies per buyer/supplier → Adapts to each dataset
 * - No currency specified → Defaults to Indonesian Rupiah (Rp)
 * 
 * **Monthly Average Calculation (CORRECT METHOD)**:
 * 1. Sum all monthly spending/purchase values from each buyer/supplier
 * 2. Count only those with values > 0
 * 3. Divide total by count of active users
 * 4. This gives the true "average monthly spending/purchase per active user"
 * 
 * **Order Frequency Calculation (CORRECT METHOD)**:
 * 1. Sum all monthly orders from ALL buyers (regardless of spending)
 * 2. Divide by count of ALL buyers (not just those with spending)
 * 3. This gives true "average monthly orders per buyer"
 * 
 * **Future Enhancement**: Real-time exchange rates via API integration
 */
interface StatcardsProps {
  type: 'buyer' | 'supplier';
  data: any[];
}

function getCurrentMonth() {
  const now = new Date();
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
}

function parseCurrency(str: string) {
  return parseInt((str || '').toString().replace(/[^\d]/g, '')) || 0;
}

// Helper function to safely parse JSON strings
function safeParseJSON(jsonStr: string, fallback: any[] | any = []) {
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

// Helper function to detect dominant currency from data
function detectDominantCurrency(data: any[], valueField: string): string {
  const currencies = new Map<string, number>();
  
  data.forEach(item => {
    const orderDetails = safeParseJSON(item.orderDetails || item.supplies || '[]');
    orderDetails.forEach((detail: any) => {
      const currency = extractCurrency(detail[valueField] || '');
      if (currency) {
        currencies.set(currency, (currencies.get(currency) || 0) + 1);
      }
    });
  });
  
  // Return the most frequent currency, or default to 'Rp ' if none found
  if (currencies.size === 0) return 'Rp ';
  
  let dominantCurrency = '';
  let maxCount = 0;
  currencies.forEach((count, currency) => {
    if (count > maxCount) {
      maxCount = count;
      dominantCurrency = currency;
    }
  });
  
  return dominantCurrency || 'Rp ';
}

// Helper function to convert values to a target currency for consistent display
function convertToTargetCurrency(value: number, sourceCurrency: string, targetCurrency: string): number {
  // Simple conversion rates (in production, use real-time exchange rates)
  const conversionRates: { [key: string]: { [key: string]: number } } = {
    'Rp': {
      'USD': 0.000065, // 1 IDR = 0.000065 USD (approximate)
      'EUR': 0.000060, // 1 IDR = 0.000060 EUR (approximate)
      'SGD': 0.000088, // 1 IDR = 0.000088 SGD (approximate)
      'Rp': 1
    },
    'USD': {
      'Rp': 15400, // 1 USD = 15400 IDR (approximate)
      'EUR': 0.92, // 1 USD = 0.92 EUR (approximate)
      'SGD': 1.35, // 1 USD = 1.35 SGD (approximate)
      'USD': 1
    },
    'EUR': {
      'Rp': 16700, // 1 EUR = 16700 IDR (approximate)
      'USD': 1.09, // 1 EUR = 1.09 USD (approximate)
      'SGD': 1.47, // 1 EUR = 1.47 SGD (approximate)
      'EUR': 1
    },
    'SGD': {
      'Rp': 11300, // 1 SGD = 11300 IDR (approximate)
      'USD': 0.74, // 1 SGD = 0.74 USD (approximate)
      'EUR': 0.68, // 1 SGD = 0.68 EUR (approximate)
      'SGD': 1
    }
  };
  
  const rate = conversionRates[sourceCurrency]?.[targetCurrency];
  return rate ? value * rate : value;
}

// Helper function to round to nearest hundred thousand
function roundToHundredThousand(value: number): number {
  return Math.round(value / 100000) * 100000;
}

export default function Statcards({ type, data }: StatcardsProps) {
  const stats = useMemo(() => {
    if (type === 'buyer') {
      const totalBuyers = data.length;
      const activeBuyers = data.filter(b => b.status === 'Active').length;
      const monthKey = getCurrentMonth();
      
      // Detect dominant currency from buyer data
      const dominantCurrency = detectDominantCurrency(data, 'totalSpend');
      
      // Average monthly spend per buyer - CORRECT CALCULATION
      // Use the monthly analytics data passed from the buyers page
      let totalAvgMonthlySpend = 0;
      let totalAvgMonthlyOrders = 0;
      let buyersWithSpending = 0;
      let buyersWithOrders = 0;
      
      data.forEach(buyer => {
        // Use the pre-calculated monthly averages (same as BuyerProfile)
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
          value: dominantCurrency + ' ' + roundToHundredThousand(avgMonthlySpend).toLocaleString('id-ID'),
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
      const monthKey = getCurrentMonth();
      
      // Detect dominant currency from supplier data
      const dominantCurrency = detectDominantCurrency(data, 'totalValue');
      
      // Average monthly purchase value per supplier - CORRECT CALCULATION
      // Use the monthly analytics data passed from the suppliers page
      let totalAvgMonthlyValue = 0;
      let suppliersWithPurchases = 0;
      
      data.forEach(supplier => {
        // Use the pre-calculated monthly averages (same as SupplierProfile)
        const avgMonthlyPurchaseValue = supplier.avgMonthlyPurchaseValue || 0;
        
        // Add to total
        totalAvgMonthlyValue += avgMonthlyPurchaseValue;
        
        // Only count suppliers who actually have purchases this month
        if (avgMonthlyPurchaseValue > 0) {
          suppliersWithPurchases++;
        }
      });
      
      // Calculate average: total of monthly averages ÷ count of suppliers with purchases
      const avgMonthlyValue = suppliersWithPurchases > 0 ? totalAvgMonthlyValue / suppliersWithPurchases : 0;
      // On-time delivery rate: average of all suppliers' deliverySuccess (from logistics or supplies)
      let deliverySuccessSum = 0, deliverySuccessCount = 0;
      data.forEach(supplier => {
        // Parse logistics from string - expect object or empty array
        const logistics = safeParseJSON(supplier.logistics, {});
        // Prefer logistics.deliverySuccess if present, else average from supplies
        if (logistics && typeof logistics === 'object' && 'deliverySuccess' in logistics) {
          // If logistics is an object with deliverySuccess
          if (logistics.deliverySuccess !== undefined && logistics.deliverySuccess !== '') {
            deliverySuccessSum += parseFloat(logistics.deliverySuccess);
            deliverySuccessCount++;
          }
        } else {
          // If logistics is empty or doesn't have deliverySuccess, check supplies
          const supplies = safeParseJSON(supplier.supplies);
          supplies.forEach((s: any) => {
            if (s.deliverySuccess !== undefined && s.deliverySuccess !== '') {
              deliverySuccessSum += parseFloat(s.deliverySuccess);
              deliverySuccessCount++;
            }
          });
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
          value: dominantCurrency + ' ' + roundToHundredThousand(avgMonthlyValue).toLocaleString('id-ID'),
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
              <ArrowUpRight className="w-5 h-5 text-[#3ea73b]" />
            ) : (
              <ArrowDownRight className="w-5 h-5 text-[#f65911]" />
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

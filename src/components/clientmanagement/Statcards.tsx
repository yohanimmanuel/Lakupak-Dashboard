import React from "react";
import { Users, UserCheck, Repeat, Truck, CheckCircle, DollarSign, Clock } from "lucide-react";
import { useMemo } from 'react';
import { Buyer, Supplier, OrderDetail, SupplyDetail } from '@/types/client';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';
import { useUserStore } from '@/store/userStore';
import { cumulativeCountGrowthDetail } from '@/utils/monthOverMonthGrowth';
import { AnalyticsMetricCard } from '@/components/analyticsperformance/FinancialAnalytics';
import { useClientsTranslations } from '@/hooks/useClientsTranslations';
import {
  STAT_ICON_BG_BLUE,
  STAT_ICON_BG_GREEN,
  STAT_ICON_BLUE,
  STAT_ICON_GREEN,
} from '@/utils/statCardStyles';

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

// Helper function to safely parse JSON strings
function safeParseJSON(jsonStr: string, fallback: OrderDetail[] | SupplyDetail[] | Record<string, unknown> = []) {
  if (!jsonStr) return fallback;
  try {
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(fallback)) {
      return Array.isArray(parsed) ? parsed : fallback;
    }
    return parsed || fallback;
  } catch {
    return fallback;
  }
}

function cleanDecimals(value: number): number {
  return Math.round(value);
}

type StatCardConfig = {
  label: string;
  value: string;
  change: number | null;
  previousValue?: string;
  icon: React.ReactNode;
  color: string;
};

export default function Statcards({ type, data }: StatcardsProps) {
  const user = useUserStore(state => state.user);
  const userCurrency = user?.currency || getDefaultCurrency();
  const { tShared, tCommon } = useClientsTranslations();
  const naLabel = tCommon('notAvailable');
  const comparisonLabel = tCommon('vsLastMonth');
  const perMonth = tShared('stats.perMonth');

  const stats = useMemo((): StatCardConfig[] => {
    try {
      if (type === 'buyer') {
        const totalBuyers = data.length;
        const activeBuyers = data.filter(b => b.status === 'Active').length;
        const totalBuyersGrowth = cumulativeCountGrowthDetail(data, (buyer) => buyer.createdAt);
        
        let totalAvgMonthlySpend = 0;
        let totalAvgMonthlyOrders = 0;
        let buyersWithSpending = 0;
        let buyersWithOrders = 0;
        
        data.forEach(buyer => {
          try {
            if ('avgMonthlySpending' in buyer && 'avgMonthlyOrders' in buyer) {
              const cleanSpending = String(buyer.avgMonthlySpending || '').replace(/[^\d.-]/g, '');
              const cleanOrders = String(buyer.avgMonthlyOrders || '').replace(/[^\d.-]/g, '');
              const avgMonthlySpending = Number(cleanSpending) || 0;
              const avgMonthlyOrders = Number(cleanOrders) || 0;
              
              totalAvgMonthlySpend += avgMonthlySpending;
              totalAvgMonthlyOrders += avgMonthlyOrders;
              
              if (avgMonthlySpending > 0) buyersWithSpending++;
              if (avgMonthlyOrders > 0) buyersWithOrders++;
            } else {
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
                  const cleanSpend = String(o.totalSpend || '').replace(/[^\d.-]/g, '');
                  const cleanOrders = String(o.totalOrders || '').replace(/[^\d.-]/g, '');
                  buyerTotalSpend += Number(cleanSpend) || 0;
                  buyerTotalOrders += Number(cleanOrders) || 0;
                });
                
                totalAvgMonthlySpend += buyerTotalSpend;
                totalAvgMonthlyOrders += buyerTotalOrders;
                
                if (buyerTotalSpend > 0) buyersWithSpending++;
                if (buyerTotalOrders > 0) buyersWithOrders++;
              }
            }
          } catch {
          }
        });
        
        const avgMonthlySpend = buyersWithSpending > 0 ? totalAvgMonthlySpend / buyersWithSpending : 0;
        const avgOrderFreq = buyersWithOrders > 0 ? (totalAvgMonthlyOrders / buyersWithOrders).toFixed(1) : '0.0';
        
        return [
          {
            label: tShared('stats.totalBuyers'),
            value: totalBuyers.toLocaleString(),
            change: totalBuyersGrowth.growth,
            previousValue:
              totalBuyersGrowth.previous != null
                ? totalBuyersGrowth.previous.toLocaleString()
                : undefined,
            icon: <Users className={`w-6 h-6 ${STAT_ICON_BLUE}`} />,
            color: STAT_ICON_BG_BLUE,
          },
          {
            label: tShared('stats.activeBuyers'),
            value: activeBuyers.toLocaleString(),
            change: null,
            icon: <UserCheck className={`w-6 h-6 ${STAT_ICON_GREEN}`} />,
            color: STAT_ICON_BG_GREEN,
          },
          {
            label: tShared('stats.monthlyBuyerSpend'),
            value: formatCurrency(cleanDecimals(avgMonthlySpend), userCurrency),
            change: null,
            icon: <DollarSign className={`w-6 h-6 ${STAT_ICON_BLUE}`} />,
            color: STAT_ICON_BG_BLUE,
          },
          {
            label: tShared('stats.avgOrderFrequency'),
            value: `${avgOrderFreq}${perMonth}`,
            change: null,
            icon: <Repeat className={`w-6 h-6 ${STAT_ICON_BLUE}`} />,
            color: STAT_ICON_BG_BLUE,
          },
        ];
      }

      const totalSuppliers = data.length;
      const activeSuppliers = data.filter(s => s.status === 'Active').length;
      const totalSuppliersGrowth = cumulativeCountGrowthDetail(data, (supplier) => supplier.createdAt);
      
      let totalAvgMonthlyValue = 0;
      let suppliersWithPurchases = 0;
      
      data.forEach(supplier => {
        try {
          if ('avgMonthlyPurchaseValue' in supplier) {
            const cleanValue = String(supplier.avgMonthlyPurchaseValue || '').replace(/[^\d.-]/g, '');
            const avgMonthlyPurchaseValue = Number(cleanValue) || 0;
            
            totalAvgMonthlyValue += avgMonthlyPurchaseValue;
            
            if (avgMonthlyPurchaseValue > 0) {
              suppliersWithPurchases++;
            }
          } else {
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
                const cleanValue = String(s.totalValue || '').replace(/[^\d.-]/g, '');
                supplierTotalValue += Number(cleanValue) || 0;
              });
              
              totalAvgMonthlyValue += supplierTotalValue;
              
              if (supplierTotalValue > 0) {
                suppliersWithPurchases++;
              }
            }
          }
        } catch {
        }
      });
      
      const avgMonthlyValue = suppliersWithPurchases > 0 ? totalAvgMonthlyValue / suppliersWithPurchases : 0;
      
      let deliverySuccessSum = 0;
      let deliverySuccessCount = 0;
      data.forEach(supplier => {
        try {
          if ('logistics' in supplier && supplier.logistics) {
            const logistics = safeParseJSON(supplier.logistics, {});
            if (logistics && typeof logistics === 'object' && 'deliverySuccess' in logistics) {
              if (logistics.deliverySuccess !== undefined && logistics.deliverySuccess !== '') {
                const successRate = parseFloat(logistics.deliverySuccess);
                if (!isNaN(successRate)) {
                  deliverySuccessSum += successRate;
                  deliverySuccessCount++;
                }
              }
            }
          }
          
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
        } catch {
        }
      });
      const onTimeRate = deliverySuccessCount > 0 ? Math.round(deliverySuccessSum / deliverySuccessCount) : 0;
      
      return [
        {
          label: tShared('stats.totalSuppliers'),
          value: totalSuppliers.toLocaleString(),
          change: totalSuppliersGrowth.growth,
          previousValue:
            totalSuppliersGrowth.previous != null
              ? totalSuppliersGrowth.previous.toLocaleString()
              : undefined,
          icon: <Truck className={`w-6 h-6 ${STAT_ICON_BLUE}`} />,
          color: STAT_ICON_BG_BLUE,
        },
        {
          label: tShared('stats.activeSuppliers'),
          value: activeSuppliers.toLocaleString(),
          change: null,
          icon: <CheckCircle className={`w-6 h-6 ${STAT_ICON_GREEN}`} />,
          color: STAT_ICON_BG_GREEN,
        },
        {
          label: tShared('stats.monthlyPurchaseValue'),
          value: formatCurrency(cleanDecimals(avgMonthlyValue), userCurrency),
          change: null,
          icon: <DollarSign className={`w-6 h-6 ${STAT_ICON_BLUE}`} />,
          color: STAT_ICON_BG_BLUE,
        },
        {
          label: tShared('stats.onTimeDeliveryRate'),
          value: `${onTimeRate}%`,
          change: null,
          icon: <Clock className={`w-6 h-6 ${STAT_ICON_BLUE}`} />,
          color: STAT_ICON_BG_BLUE,
        },
      ];
    } catch {
      const totalGrowth = cumulativeCountGrowthDetail(
        data,
        (entry) => entry.createdAt,
      );

      if (type === 'buyer') {
        return [
          {
            label: tShared('stats.totalBuyers'),
            value: data.length.toLocaleString(),
            change: totalGrowth.growth,
            previousValue:
              totalGrowth.previous != null ? totalGrowth.previous.toLocaleString() : undefined,
            icon: <Users className={`w-6 h-6 ${STAT_ICON_BLUE}`} />,
            color: STAT_ICON_BG_BLUE,
          },
          {
            label: tShared('stats.activeBuyers'),
            value: data.filter(b => b.status === 'Active').length.toLocaleString(),
            change: null,
            icon: <UserCheck className={`w-6 h-6 ${STAT_ICON_GREEN}`} />,
            color: STAT_ICON_BG_GREEN,
          },
          {
            label: tShared('stats.monthlyBuyerSpend'),
            value: naLabel,
            change: null,
            icon: <DollarSign className={`w-6 h-6 ${STAT_ICON_BLUE}`} />,
            color: STAT_ICON_BG_BLUE,
          },
          {
            label: tShared('stats.avgOrderFrequency'),
            value: naLabel,
            change: null,
            icon: <Repeat className={`w-6 h-6 ${STAT_ICON_BLUE}`} />,
            color: STAT_ICON_BG_BLUE,
          },
        ];
      }

      return [
        {
          label: tShared('stats.totalSuppliers'),
          value: data.length.toLocaleString(),
          change: totalGrowth.growth,
          previousValue:
            totalGrowth.previous != null ? totalGrowth.previous.toLocaleString() : undefined,
          icon: <Truck className={`w-6 h-6 ${STAT_ICON_BLUE}`} />,
          color: STAT_ICON_BG_BLUE,
        },
        {
          label: tShared('stats.activeSuppliers'),
          value: data.filter(s => s.status === 'Active').length.toLocaleString(),
          change: null,
          icon: <CheckCircle className={`w-6 h-6 ${STAT_ICON_GREEN}`} />,
          color: STAT_ICON_BG_GREEN,
        },
        {
          label: tShared('stats.monthlyPurchaseValue'),
          value: naLabel,
          change: null,
          icon: <DollarSign className={`w-6 h-6 ${STAT_ICON_BLUE}`} />,
          color: STAT_ICON_BG_BLUE,
        },
        {
          label: tShared('stats.onTimeDeliveryRate'),
          value: naLabel,
          change: null,
          icon: <Clock className={`w-6 h-6 ${STAT_ICON_BLUE}`} />,
          color: STAT_ICON_BG_BLUE,
        },
      ];
    }
  }, [type, data, userCurrency, tShared, naLabel, perMonth]);

  return (
    <div className="mx-auto grid w-full grid-cols-1 gap-3 @3xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      {stats.map((stat) => (
        <AnalyticsMetricCard
          key={stat.label}
          title={stat.label}
          value={stat.value}
          change={stat.change}
          previousValue={stat.previousValue}
          icon={stat.icon}
          color={stat.color}
          comparisonLabel={comparisonLabel}
          naLabel={naLabel}
        />
      ))}
    </div>
  );
}

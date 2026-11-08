import React from "react";
import { Users, UserCheck, Repeat, Truck, CheckCircle, DollarSign, Clock } from "lucide-react";
import { useMemo } from 'react';
import { Buyer, Supplier, OrderDetail, SupplyDetail } from '@/types/client';
import { formatCurrency, formatCompactCurrency, getDefaultCurrency } from '@/utils/currencyUtils';
import { useUserStore } from '@/store/userStore';
import {
  calendarMonthCountGrowthDetail,
  calendarMonthValueGrowth,
  getCalendarMonthPair,
  parseDate,
  toMonthKey,
} from '@/utils/monthOverMonthGrowth';
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

function cleanDecimals(value: number): number {
  return Math.round(value);
}

/** Whole-currency amounts (IDR-safe: strips thousand separators like 12.345.000). */
function parseMoneyValue(value: unknown): number {
  return parseInt(String(value ?? '').replace(/[^\d-]/g, ''), 10) || 0;
}

function monthKeyFromValue(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : toMonthKey(value);

  const raw = String(value).trim();
  // Date-only / year-month: take YYYY-MM from the string so UTC parse cannot shift the month.
  if (/^\d{4}-\d{2}(-\d{2})?$/.test(raw)) return raw.substring(0, 7);

  const parsed = parseDate(value);
  return parsed ? toMonthKey(parsed) : null;
}

function parseBuyerOrderDetails(buyer: Buyer): OrderDetail[] {
  if (!buyer.orderDetails) return [];
  try {
    const parsed = JSON.parse(buyer.orderDetails);
    return Array.isArray(parsed) ? (parsed as OrderDetail[]) : [];
  } catch {
    return [];
  }
}

/** Calendar-month order activity from buyer orderDetails (items = totalOrders per row). */
function buyerCalendarMonthActivity(buyers: Buyer[], from: Date = new Date()) {
  const { currentKey, previousKey } = getCalendarMonthPair(from);
  const current = { spend: 0, items: 0, buyerIds: new Set<string>() };
  const previous = { spend: 0, items: 0, buyerIds: new Set<string>() };

  for (const buyer of buyers) {
    const buyerKey = buyer.buyerId || String(buyer.id ?? '');
    for (const detail of parseBuyerOrderDetails(buyer)) {
      const key = monthKeyFromValue(detail.lastOrderDate);
      if (!key) continue;
      const bucket = key === currentKey ? current : key === previousKey ? previous : null;
      if (!bucket) continue;
      bucket.spend += parseMoneyValue(detail.totalSpend);
      const items = parseMoneyValue(detail.totalOrders);
      bucket.items += items > 0 ? items : 1;
      if (buyerKey) bucket.buyerIds.add(buyerKey);
    }
  }

  return { current, previous };
}

function parseSupplierSupplies(supplier: Supplier): SupplyDetail[] {
  if (!supplier.supplies) return [];
  try {
    const parsed = JSON.parse(supplier.supplies);
    return Array.isArray(parsed) ? (parsed as SupplyDetail[]) : [];
  } catch {
    return [];
  }
}

/** Same avg monthly purchase formula as the suppliers list page. */
function supplierAvgMonthlyPurchase(supplier: Supplier): number {
  const fromField = parseMoneyValue(supplier.avgMonthlyPurchaseValue);
  if (fromField > 0) return fromField;

  const supplies = parseSupplierSupplies(supplier);
  if (supplies.length === 0) return 0;

  let totalPurchaseValue = 0;
  const uniqueMonths = new Set<string>();
  for (const supply of supplies) {
    totalPurchaseValue += parseMoneyValue(supply.totalValue);
    const monthKey = monthKeyFromValue(supply.lastDelivery);
    if (monthKey) uniqueMonths.add(monthKey);
  }

  // If dates are missing but value exists, treat as one month so the card is not stuck at 0.
  const monthCount = uniqueMonths.size > 0 ? uniqueMonths.size : totalPurchaseValue > 0 ? 1 : 0;
  return monthCount > 0 ? Math.round(totalPurchaseValue / monthCount) : 0;
}

function supplierOverallOnTimeRate(suppliers: Supplier[]): number {
  let deliverySuccessSum = 0;
  let deliverySuccessCount = 0;

  for (const supplier of suppliers) {
    if (supplier.logistics) {
      try {
        const logistics = JSON.parse(supplier.logistics) as { deliverySuccess?: string | number };
        if (logistics?.deliverySuccess !== undefined && logistics.deliverySuccess !== '') {
          const successRate = parseFloat(String(logistics.deliverySuccess));
          if (!Number.isNaN(successRate)) {
            deliverySuccessSum += successRate;
            deliverySuccessCount += 1;
          }
        }
      } catch {
        // ignore invalid logistics JSON
      }
    }

    for (const supply of parseSupplierSupplies(supplier)) {
      if (supply.deliverySuccess !== undefined && supply.deliverySuccess !== '') {
        const successRate = parseFloat(String(supply.deliverySuccess));
        if (!Number.isNaN(successRate)) {
          deliverySuccessSum += successRate;
          deliverySuccessCount += 1;
        }
      }
    }
  }

  return deliverySuccessCount > 0 ? Math.round(deliverySuccessSum / deliverySuccessCount) : 0;
}

/** Calendar-month purchase activity from supplier supplies (by lastDelivery). */
function supplierCalendarMonthActivity(suppliers: Supplier[], from: Date = new Date()) {
  const { currentKey, previousKey } = getCalendarMonthPair(from);
  const current = {
    spend: 0,
    purchases: 0,
    supplierIds: new Set<string>(),
    deliverySuccessSum: 0,
    deliverySuccessCount: 0,
  };
  const previous = {
    spend: 0,
    purchases: 0,
    supplierIds: new Set<string>(),
    deliverySuccessSum: 0,
    deliverySuccessCount: 0,
  };

  for (const supplier of suppliers) {
    const supplierKey = supplier.supplierId || String(supplier.id ?? '');
    for (const detail of parseSupplierSupplies(supplier)) {
      const key = monthKeyFromValue(detail.lastDelivery);
      if (!key) continue;
      const bucket = key === currentKey ? current : key === previousKey ? previous : null;
      if (!bucket) continue;
      bucket.spend += parseMoneyValue(detail.totalValue);
      bucket.purchases += 1;
      if (supplierKey) bucket.supplierIds.add(supplierKey);
      if (detail.deliverySuccess !== undefined && detail.deliverySuccess !== '') {
        const successRate = parseFloat(String(detail.deliverySuccess));
        if (!Number.isNaN(successRate)) {
          bucket.deliverySuccessSum += successRate;
          bucket.deliverySuccessCount += 1;
        }
      }
    }
  }

  return { current, previous };
}

type StatCardConfig = {
  label: string;
  value: string;
  change: number | null;
  currentValue?: string;
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
        const buyers = data as Buyer[];
        const totalBuyers = buyers.length;
        const activeBuyers = buyers.filter((b) => b.status === 'Active').length;
        const totalBuyersGrowth = calendarMonthCountGrowthDetail(buyers, (buyer) => buyer.createdAt);
        const activity = buyerCalendarMonthActivity(buyers);
        const activeBuyersGrowth = calendarMonthValueGrowth(
          activity.current.buyerIds.size,
          activity.previous.buyerIds.size,
        );
        // Monthly buyer spend = average spend per ordering buyer in that calendar month.
        const currentMonthlyBuyerSpend =
          activity.current.buyerIds.size > 0
            ? activity.current.spend / activity.current.buyerIds.size
            : 0;
        const previousMonthlyBuyerSpend =
          activity.previous.buyerIds.size > 0
            ? activity.previous.spend / activity.previous.buyerIds.size
            : 0;
        const monthlySpendGrowth = calendarMonthValueGrowth(
          currentMonthlyBuyerSpend,
          previousMonthlyBuyerSpend,
        );
        const currentMonthlyItems =
          activity.current.buyerIds.size > 0
            ? activity.current.items / activity.current.buyerIds.size
            : 0;
        const previousMonthlyItems =
          activity.previous.buyerIds.size > 0
            ? activity.previous.items / activity.previous.buyerIds.size
            : 0;
        const monthlyItemsGrowth = calendarMonthValueGrowth(
          currentMonthlyItems,
          previousMonthlyItems,
        );

        return [
          {
            label: tShared('stats.totalBuyers'),
            value: totalBuyers.toLocaleString(),
            change: totalBuyersGrowth.growth,
            currentValue: totalBuyersGrowth.current.toLocaleString(),
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
            change: activeBuyersGrowth.growth,
            currentValue: activeBuyersGrowth.current.toLocaleString(),
            previousValue:
              activeBuyersGrowth.previous != null
                ? activeBuyersGrowth.previous.toLocaleString()
                : undefined,
            icon: <UserCheck className={`w-6 h-6 ${STAT_ICON_GREEN}`} />,
            color: STAT_ICON_BG_GREEN,
          },
          {
            label: tShared('stats.monthlyBuyerSpend'),
            value: formatCurrency(cleanDecimals(currentMonthlyBuyerSpend), userCurrency),
            change: monthlySpendGrowth.growth,
            currentValue: formatCompactCurrency(monthlySpendGrowth.current, userCurrency),
            previousValue:
              monthlySpendGrowth.previous != null
                ? formatCompactCurrency(monthlySpendGrowth.previous, userCurrency)
                : undefined,
            icon: <DollarSign className={`w-6 h-6 ${STAT_ICON_BLUE}`} />,
            color: STAT_ICON_BG_BLUE,
          },
          {
            label: tShared('stats.avgOrderFrequency'),
            value: `${currentMonthlyItems.toFixed(1)}${perMonth}`,
            change: monthlyItemsGrowth.growth,
            currentValue: `${monthlyItemsGrowth.current.toFixed(1)}${perMonth}`,
            previousValue:
              monthlyItemsGrowth.previous != null
                ? `${monthlyItemsGrowth.previous.toFixed(1)}${perMonth}`
                : undefined,
            icon: <Repeat className={`w-6 h-6 ${STAT_ICON_BLUE}`} />,
            color: STAT_ICON_BG_BLUE,
          },
        ];
      }

      const suppliers = data as Supplier[];
      const totalSuppliers = suppliers.length;
      const activeSuppliers = suppliers.filter((s) => s.status === 'Active').length;
      const totalSuppliersGrowth = calendarMonthCountGrowthDetail(suppliers, (supplier) => supplier.createdAt);
      const activity = supplierCalendarMonthActivity(suppliers);
      const activeSuppliersGrowth = calendarMonthValueGrowth(
        activity.current.supplierIds.size,
        activity.previous.supplierIds.size,
      );

      let totalAvgMonthlyPurchases = 0;
      let suppliersWithPurchases = 0;
      for (const supplier of suppliers) {
        const avg = supplierAvgMonthlyPurchase(supplier);
        if (avg > 0) {
          totalAvgMonthlyPurchases += avg;
          suppliersWithPurchases += 1;
        }
      }
      const avgMonthlyPurchases =
        suppliersWithPurchases > 0 ? totalAvgMonthlyPurchases / suppliersWithPurchases : 0;

      // Growth compares avg purchase per active supplier this calendar month vs last.
      const currentMonthAvgPurchases =
        activity.current.supplierIds.size > 0
          ? activity.current.spend / activity.current.supplierIds.size
          : 0;
      const previousMonthAvgPurchases =
        activity.previous.supplierIds.size > 0
          ? activity.previous.spend / activity.previous.supplierIds.size
          : 0;
      const monthlyPurchasesGrowth = calendarMonthValueGrowth(
        currentMonthAvgPurchases,
        previousMonthAvgPurchases,
      );

      const overallOnTimeRate = supplierOverallOnTimeRate(suppliers);
      const currentOnTimeRate =
        activity.current.deliverySuccessCount > 0
          ? activity.current.deliverySuccessSum / activity.current.deliverySuccessCount
          : 0;
      const previousOnTimeRate =
        activity.previous.deliverySuccessCount > 0
          ? activity.previous.deliverySuccessSum / activity.previous.deliverySuccessCount
          : 0;
      const onTimeGrowth = calendarMonthValueGrowth(currentOnTimeRate, previousOnTimeRate);

      return [
        {
          label: tShared('stats.totalSuppliers'),
          value: totalSuppliers.toLocaleString(),
          change: totalSuppliersGrowth.growth,
          currentValue: totalSuppliersGrowth.current.toLocaleString(),
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
          change: activeSuppliersGrowth.growth,
          currentValue: activeSuppliersGrowth.current.toLocaleString(),
          previousValue:
            activeSuppliersGrowth.previous != null
              ? activeSuppliersGrowth.previous.toLocaleString()
              : undefined,
          icon: <CheckCircle className={`w-6 h-6 ${STAT_ICON_GREEN}`} />,
          color: STAT_ICON_BG_GREEN,
        },
        {
          label: tShared('stats.monthlyPurchaseValue'),
          value: formatCurrency(cleanDecimals(avgMonthlyPurchases), userCurrency),
          change: monthlyPurchasesGrowth.growth,
          currentValue: formatCompactCurrency(monthlyPurchasesGrowth.current, userCurrency),
          previousValue:
            monthlyPurchasesGrowth.previous != null
              ? formatCompactCurrency(monthlyPurchasesGrowth.previous, userCurrency)
              : undefined,
          icon: <DollarSign className={`w-6 h-6 ${STAT_ICON_BLUE}`} />,
          color: STAT_ICON_BG_BLUE,
        },
        {
          label: tShared('stats.onTimeDeliveryRate'),
          value: `${overallOnTimeRate}%`,
          change: onTimeGrowth.growth,
          currentValue: `${Math.round(onTimeGrowth.current)}%`,
          previousValue:
            onTimeGrowth.previous != null ? `${Math.round(onTimeGrowth.previous)}%` : undefined,
          icon: <Clock className={`w-6 h-6 ${STAT_ICON_BLUE}`} />,
          color: STAT_ICON_BG_BLUE,
        },
      ];
    } catch {
      const totalGrowth = calendarMonthCountGrowthDetail(data, (entry) => entry.createdAt);

      if (type === 'buyer') {
        const buyers = data as Buyer[];
        const activity = buyerCalendarMonthActivity(buyers);
        const activeBuyersGrowth = calendarMonthValueGrowth(
          activity.current.buyerIds.size,
          activity.previous.buyerIds.size,
        );
        const currentMonthlyBuyerSpend =
          activity.current.buyerIds.size > 0
            ? activity.current.spend / activity.current.buyerIds.size
            : 0;
        const previousMonthlyBuyerSpend =
          activity.previous.buyerIds.size > 0
            ? activity.previous.spend / activity.previous.buyerIds.size
            : 0;
        const monthlySpendGrowth = calendarMonthValueGrowth(
          currentMonthlyBuyerSpend,
          previousMonthlyBuyerSpend,
        );
        const currentMonthlyItems =
          activity.current.buyerIds.size > 0
            ? activity.current.items / activity.current.buyerIds.size
            : 0;
        const previousMonthlyItems =
          activity.previous.buyerIds.size > 0
            ? activity.previous.items / activity.previous.buyerIds.size
            : 0;
        const monthlyItemsGrowth = calendarMonthValueGrowth(
          currentMonthlyItems,
          previousMonthlyItems,
        );

        return [
          {
            label: tShared('stats.totalBuyers'),
            value: data.length.toLocaleString(),
            change: totalGrowth.growth,
            currentValue: totalGrowth.current.toLocaleString(),
            previousValue:
              totalGrowth.previous != null ? totalGrowth.previous.toLocaleString() : undefined,
            icon: <Users className={`w-6 h-6 ${STAT_ICON_BLUE}`} />,
            color: STAT_ICON_BG_BLUE,
          },
          {
            label: tShared('stats.activeBuyers'),
            value: data.filter((b) => b.status === 'Active').length.toLocaleString(),
            change: activeBuyersGrowth.growth,
            currentValue: activeBuyersGrowth.current.toLocaleString(),
            previousValue:
              activeBuyersGrowth.previous != null
                ? activeBuyersGrowth.previous.toLocaleString()
                : undefined,
            icon: <UserCheck className={`w-6 h-6 ${STAT_ICON_GREEN}`} />,
            color: STAT_ICON_BG_GREEN,
          },
          {
            label: tShared('stats.monthlyBuyerSpend'),
            value: formatCurrency(cleanDecimals(currentMonthlyBuyerSpend), userCurrency),
            change: monthlySpendGrowth.growth,
            currentValue: formatCompactCurrency(monthlySpendGrowth.current, userCurrency),
            previousValue:
              monthlySpendGrowth.previous != null
                ? formatCompactCurrency(monthlySpendGrowth.previous, userCurrency)
                : undefined,
            icon: <DollarSign className={`w-6 h-6 ${STAT_ICON_BLUE}`} />,
            color: STAT_ICON_BG_BLUE,
          },
          {
            label: tShared('stats.avgOrderFrequency'),
            value: `${currentMonthlyItems.toFixed(1)}${perMonth}`,
            change: monthlyItemsGrowth.growth,
            currentValue: `${monthlyItemsGrowth.current.toFixed(1)}${perMonth}`,
            previousValue:
              monthlyItemsGrowth.previous != null
                ? `${monthlyItemsGrowth.previous.toFixed(1)}${perMonth}`
                : undefined,
            icon: <Repeat className={`w-6 h-6 ${STAT_ICON_BLUE}`} />,
            color: STAT_ICON_BG_BLUE,
          },
        ];
      }

      const suppliers = data as Supplier[];
      const activity = supplierCalendarMonthActivity(suppliers);
      const activeSuppliersGrowth = calendarMonthValueGrowth(
        activity.current.supplierIds.size,
        activity.previous.supplierIds.size,
      );
      let totalAvgMonthlyPurchases = 0;
      let suppliersWithPurchases = 0;
      for (const supplier of suppliers) {
        const avg = supplierAvgMonthlyPurchase(supplier);
        if (avg > 0) {
          totalAvgMonthlyPurchases += avg;
          suppliersWithPurchases += 1;
        }
      }
      const avgMonthlyPurchases =
        suppliersWithPurchases > 0 ? totalAvgMonthlyPurchases / suppliersWithPurchases : 0;
      const currentMonthAvgPurchases =
        activity.current.supplierIds.size > 0
          ? activity.current.spend / activity.current.supplierIds.size
          : 0;
      const previousMonthAvgPurchases =
        activity.previous.supplierIds.size > 0
          ? activity.previous.spend / activity.previous.supplierIds.size
          : 0;
      const monthlyPurchasesGrowth = calendarMonthValueGrowth(
        currentMonthAvgPurchases,
        previousMonthAvgPurchases,
      );
      const overallOnTimeRate = supplierOverallOnTimeRate(suppliers);
      const currentOnTimeRate =
        activity.current.deliverySuccessCount > 0
          ? activity.current.deliverySuccessSum / activity.current.deliverySuccessCount
          : 0;
      const previousOnTimeRate =
        activity.previous.deliverySuccessCount > 0
          ? activity.previous.deliverySuccessSum / activity.previous.deliverySuccessCount
          : 0;
      const onTimeGrowth = calendarMonthValueGrowth(currentOnTimeRate, previousOnTimeRate);

      return [
        {
          label: tShared('stats.totalSuppliers'),
          value: data.length.toLocaleString(),
          change: totalGrowth.growth,
          currentValue: totalGrowth.current.toLocaleString(),
          previousValue:
            totalGrowth.previous != null ? totalGrowth.previous.toLocaleString() : undefined,
          icon: <Truck className={`w-6 h-6 ${STAT_ICON_BLUE}`} />,
          color: STAT_ICON_BG_BLUE,
        },
        {
          label: tShared('stats.activeSuppliers'),
          value: data.filter((s) => s.status === 'Active').length.toLocaleString(),
          change: activeSuppliersGrowth.growth,
          currentValue: activeSuppliersGrowth.current.toLocaleString(),
          previousValue:
            activeSuppliersGrowth.previous != null
              ? activeSuppliersGrowth.previous.toLocaleString()
              : undefined,
          icon: <CheckCircle className={`w-6 h-6 ${STAT_ICON_GREEN}`} />,
          color: STAT_ICON_BG_GREEN,
        },
        {
          label: tShared('stats.monthlyPurchaseValue'),
          value: formatCurrency(cleanDecimals(avgMonthlyPurchases), userCurrency),
          change: monthlyPurchasesGrowth.growth,
          currentValue: formatCompactCurrency(monthlyPurchasesGrowth.current, userCurrency),
          previousValue:
            monthlyPurchasesGrowth.previous != null
              ? formatCompactCurrency(monthlyPurchasesGrowth.previous, userCurrency)
              : undefined,
          icon: <DollarSign className={`w-6 h-6 ${STAT_ICON_BLUE}`} />,
          color: STAT_ICON_BG_BLUE,
        },
        {
          label: tShared('stats.onTimeDeliveryRate'),
          value: `${overallOnTimeRate}%`,
          change: onTimeGrowth.growth,
          currentValue: `${Math.round(onTimeGrowth.current)}%`,
          previousValue:
            onTimeGrowth.previous != null ? `${Math.round(onTimeGrowth.previous)}%` : undefined,
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
          currentValue={stat.currentValue}
          previousValue={stat.previousValue}
          icon={stat.icon}
          color={stat.color}
          comparisonLabel={comparisonLabel}
          naLabel={naLabel}
          thisMonthLabel={tCommon('thisMonth')}
          lastMonthLabel={tCommon('vsLastMonth')}
          vsLabel={tCommon('monthComparisonVs')}
        />
      ))}
    </div>
  );
}

"use client";

import { SkeletonHomePage } from '@/components/skeleton/SkeletonHomePage';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  GripVertical,
  DollarSign,
  ShoppingCart,
  Package,
  ArrowRight,
  Settings2,
  X,
  Sparkles,
} from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import {
  AnalyticsMetricCard,
  calculateRevenueData,
  calculateTopProducts,
  formatCurrency,
} from '@/components/analyticsperformance/FinancialAnalytics';
import { calculateSalesMetrics } from '@/components/analyticsperformance/CustomerSalesAnalytics';
import { getDefaultCurrency, formatCompactCurrency } from '@/utils/currencyUtils';
import { computeOrdersListGrowth } from '@/utils/monthOverMonthGrowth';
import { sumOrderVolume } from '@/utils/orderCalculations';
import type { Order } from '@/types/order';
import type { Product } from '@/types/product';
import type { Buyer, Supplier, SupplyDetail } from '@/types/client';
import { useMapboxToken } from '@/hooks/useMapboxToken';
import {
  geocodeViaProxy,
  GeocodeResult,
  MapCoordinates,
  getOrderStatusMarkerColor,
} from '@/utils/mapboxUtils';
import { useHomeTranslations } from '@/components/dashboard/home/useHomeTranslations';
import AnalyticsWidget from '@/components/dashboard/AnalyticsWidget';
import AssortmentOpportunitiesWidget from '@/components/dashboard/AssortmentOpportunitiesWidget';
import BuyersWidget from '@/components/dashboard/BuyersWidget';
import InventoryWidget from '@/components/dashboard/InventoryWidget';
import OrdersWidget from '@/components/dashboard/OrdersWidget';
import ProductsWidget from '@/components/dashboard/ProductsWidget';
import SalesConversionEngineWidget from '@/components/dashboard/SalesConversionEngineWidget';
import SalesJobsWidget, { type HomeSalesJob } from '@/components/dashboard/SalesJobsWidget';
import SalesWidget, {
  type SalesSummary,
  type SalesTeamSummary,
} from '@/components/dashboard/SalesWidget';
import SuppliersWidget from '@/components/dashboard/SuppliersWidget';
import {
  WIDGET_LIBRARY,
  DEFAULT_WIDGET_ORDER,
  WIDGET_ID_SET,
  UNIFORM_WIDGET_LAYOUT,
  MAX_PIPELINE_ROWS,
  MAX_PRODUCT_PERFORMANCE_ROWS,
  getWidgetLayoutStorageKey,
  type WidgetId,
  type WidgetLayoutStorage,
} from '@/components/dashboard/home/homeWidgetLibrary';
import {
  DASHBOARD_SNAPSHOT_QUERY,
  normalizeOrder,
  normalizeProduct,
  normalizeBuyer,
  normalizeSupplier,
  parseNumber,
  parseString,
  safeParseJSON,
} from '@/components/dashboard/home/homeDashboardSnapshot';

interface WidgetRenderResult {
  content: ReactNode;
  action?: ReactNode;
}

interface LogisticsMapMarker {
  id: string;
  coordinates: MapCoordinates;
  label: string;
  color: string;
}

export default function HomeDashboard() {
  const {
    t,
    tCommon,
    formatOrderDate,
    widgetName,
    widgetDescription,
    widgetText,
    translateRecordStatus,
    translateOrderStatus,
  } = useHomeTranslations();
  const { user, isHydrated } = useUserStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [salesSummary, setSalesSummary] = useState<SalesSummary | null>(null);
  const [salesJobs, setSalesJobs] = useState<HomeSalesJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [aggregates, setAggregates] = useState<{
    totalRevenue: number;
    pendingRevenue: number;
    totalOrders: number;
    paidOrders: number;
    unpaidOrders: number;
    avgOrderValue: number;
    totalPiecesSold: number;
    totalUnitsSold: number;
    uniqueCustomers: number;
  } | null>(null);
  const [widgetOrder, setWidgetOrder] =
    useState<WidgetId[]>(DEFAULT_WIDGET_ORDER);
  const [draggingWidget, setDraggingWidget] = useState<WidgetId | null>(null);
  const [hoverWidget, setHoverWidget] = useState<WidgetId | null>(null);
  const [draggingSource, setDraggingSource] = useState<'layout' | 'library' | null>(null);
  const [isWidgetManagerOpen, setIsWidgetManagerOpen] = useState(false);
  const widgetManagerRef = useRef<HTMLDivElement | null>(null);
  const widgetManagerToggleRef = useRef<HTMLButtonElement | null>(null);
  const [hasHydratedLayout, setHasHydratedLayout] = useState(false);

  const userCurrency = user?.currency || getDefaultCurrency();
  const hasData = orders.length > 0;
  const logisticsGeocodedAddressesRef = useRef<Set<string>>(new Set());
  const [logisticsGeocodeResults, setLogisticsGeocodeResults] = useState<Map<string, GeocodeResult>>(new Map());
  const [isLogisticsGeocoding, setIsLogisticsGeocoding] = useState(false);
  const { token: mapboxToken } = useMapboxToken();
  const logisticsActiveOrders = useMemo(() => {
    return orders.filter((order) => {
      const address = order.deliveryAddress?.trim();
      if (!address || address.length === 0 || address === '—') {
        return false;
      }
      return ['Shipped', 'Packed', 'Pending', 'Confirmed'].includes(order.orderStatus);
    });
  }, [orders]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const storageKey = getWidgetLayoutStorageKey(user?.id);
    if (!storageKey) {
      setHasHydratedLayout(true);
      return;
    }
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) {
      setHasHydratedLayout(true);
      return;
    }
    try {
      const parsed = JSON.parse(stored) as WidgetLayoutStorage | WidgetId[];
      const rawOrder: unknown[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.order)
          ? parsed.order
          : [];
      const normalized = rawOrder.map((id) => {
        if (id === 'marketing') return 'sales';
        if (id === 'logistics') return 'salesJobs';
        return id;
      });
      const sanitized = normalized.filter((id): id is WidgetId =>
        WIDGET_ID_SET.has(id as WidgetId),
      );
      const deduped = Array.from(new Set<WidgetId>(sanitized));
      const storedRecord = Array.isArray(parsed) ? null : parsed;
      const conversionIntroduced = storedRecord?.conversionWidgetIntroduced === true;
      if (
        WIDGET_ID_SET.has('conversion') &&
        !deduped.includes('conversion') &&
        !conversionIntroduced
      ) {
        deduped.unshift('conversion');
      }
      const opportunitiesIntroduced = storedRecord?.opportunitiesWidgetIntroduced === true;
      if (!deduped.includes('opportunities') && !opportunitiesIntroduced) {
        deduped.unshift('opportunities');
      }
      setWidgetOrder(deduped.length > 0 ? deduped : DEFAULT_WIDGET_ORDER);
    } catch {
      setWidgetOrder(DEFAULT_WIDGET_ORDER);
    }
    setHasHydratedLayout(true);
  }, [user?.id]);

  useEffect(() => {
    if (typeof window === 'undefined' || !hasHydratedLayout) {
      return;
    }
    const storageKey = getWidgetLayoutStorageKey(user?.id);
    if (!storageKey) {
      return;
    }
    const payload: WidgetLayoutStorage = {
      order: widgetOrder,
      conversionWidgetIntroduced: true,
      opportunitiesWidgetIntroduced: true,
    };
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  }, [widgetOrder, hasHydratedLayout, user?.id]);

  useEffect(() => {
    if (!isWidgetManagerOpen) {
      return;
    }
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        widgetManagerRef.current &&
        !widgetManagerRef.current.contains(target) &&
        !widgetManagerToggleRef.current?.contains(target)
      ) {
        setIsWidgetManagerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isWidgetManagerOpen]);

  useEffect(() => {
    const geocodeLogisticsAddresses = async () => {
      if (logisticsActiveOrders.length === 0) {
        return;
      }

      const addresses = logisticsActiveOrders
        .map((order) => order.deliveryAddress?.trim() ?? '')
        .filter((address): address is string => address.length > 0 && address !== '—');

      if (addresses.length === 0) {
        return;
      }

      const uniqueAddresses = addresses.filter((address, index, self) => self.indexOf(address) === index);
      const addressesToGeocode = uniqueAddresses.filter(
        (address) => !logisticsGeocodedAddressesRef.current.has(address),
      );

      if (addressesToGeocode.length === 0) {
        return;
      }

      addressesToGeocode.forEach((address) => logisticsGeocodedAddressesRef.current.add(address));

      setIsLogisticsGeocoding(true);
      try {
        const newResults = await geocodeViaProxy(addressesToGeocode);
        setLogisticsGeocodeResults((prev) => {
          const updated = new Map(prev);
          newResults.forEach((result, address) => {
            updated.set(address, result);
          });
          return updated;
        });
      } catch (error) {
        // Handle geocoding errors gracefully - remove failed addresses from tracking
        addressesToGeocode.forEach((address) => {
          logisticsGeocodedAddressesRef.current.delete(address);
        });
        // Log error for debugging but don't show to user (non-critical feature)
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to geocode addresses:', error);
        }
      } finally {
        setIsLogisticsGeocoding(false);
      }
    };

    geocodeLogisticsAddresses();
  }, [logisticsActiveOrders]);

  useEffect(() => {
    // Guard OUTSIDE the try/finally so that the finally block never runs when
    // the store hasn't hydrated yet. A guard inside try() still triggers finally,
    // which calls setLoading(false) and kills the skeleton prematurely.
    if (!isHydrated) {
      return;
    }

    const controller = new AbortController();
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const hasUserId = typeof user?.id === 'number' && !Number.isNaN(user.id);
        if (!hasUserId) {
          setOrders([]);
          setProducts([]);
          setBuyers([]);
          setSuppliers([]);
          setSalesSummary(null);
          setSalesJobs([]);
          setLoading(false);
          return;
        }

        const response = await fetch('/api/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            query: DASHBOARD_SNAPSHOT_QUERY,
            variables: {
              userId: user!.id,
              ordersLimit: 50, // Reduced from 1000 to prevent slow queries and timeouts
              productsLimit: 50, // Reduced from 1000 to prevent slow queries and timeouts
              contactsLimit: 50, // Reduced from 100 for consistency
            },
          }),
        });

        if (controller.signal.aborted) {
          return;
        }

        if (!response.ok) {
          throw new Error(t('loadErrorFallback'));
        }

        const responseText = await response.text();
        if (!responseText || responseText.trim().length === 0) {
          throw new Error(t('loadErrorFallback'));
        }

        let payload;
        try {
          payload = JSON.parse(responseText);
        } catch (parseError) {
          throw new Error(t('loadErrorFallback'));
        }

        if (payload.errors && payload.errors.length > 0) {
          throw new Error(payload.errors[0]?.message || t('loadErrorFallback'));
        }

        const snapshot = payload.data?.dashboardSnapshot;
        if (!snapshot) {
          throw new Error(t('loadErrorFallback'));
        }

        // Extract aggregates from server response (calculated from ALL orders, not just paginated subset)
        if (snapshot.aggregates) {
          setAggregates({
            totalRevenue: parseNumber(snapshot.aggregates.totalRevenue),
            pendingRevenue: parseNumber(snapshot.aggregates.pendingRevenue),
            totalOrders: parseNumber(snapshot.aggregates.totalOrders),
            paidOrders: parseNumber(snapshot.aggregates.paidOrders),
            unpaidOrders: parseNumber(snapshot.aggregates.unpaidOrders),
            avgOrderValue: parseNumber(snapshot.aggregates.avgOrderValue),
            totalPiecesSold: parseNumber(snapshot.aggregates.totalPiecesSold),
            totalUnitsSold: parseNumber(snapshot.aggregates.totalUnitsSold),
            uniqueCustomers: parseNumber(snapshot.aggregates.uniqueCustomers),
          });
        }

        const normalizedOrders: Order[] = [];
        (Array.isArray(snapshot.orders) ? snapshot.orders : []).forEach((item: unknown) => {
          if (item && typeof item === 'object') {
            const normalized = normalizeOrder(item as Record<string, unknown>);
            if (normalized) {
              normalizedOrders.push(normalized);
            }
          }
        });
        setOrders(normalizedOrders);

          const normalizedProducts: Product[] = [];
        (Array.isArray(snapshot.products) ? snapshot.products : []).forEach((item: unknown) => {
            if (item && typeof item === 'object') {
              const normalized = normalizeProduct(item as Record<string, unknown>);
              if (normalized) {
                normalizedProducts.push(normalized);
              }
            }
          });
          setProducts(normalizedProducts);

          const normalizedBuyers: Buyer[] = [];
        (Array.isArray(snapshot.buyers) ? snapshot.buyers : []).forEach((item: unknown) => {
            if (item && typeof item === 'object') {
              const normalized = normalizeBuyer(item as Record<string, unknown>);
              if (normalized) {
                normalizedBuyers.push(normalized);
              }
            }
          });
          setBuyers(normalizedBuyers);

          const normalizedSuppliers: Supplier[] = [];
        (Array.isArray(snapshot.suppliers) ? snapshot.suppliers : []).forEach((item: unknown) => {
            if (item && typeof item === 'object') {
              const normalized = normalizeSupplier(item as Record<string, unknown>);
              if (normalized) {
                normalizedSuppliers.push(normalized);
              }
            }
          });
          setSuppliers(normalizedSuppliers);

          const rawSummary = (snapshot as { salesSummary?: Record<string, unknown> }).salesSummary;
          if (rawSummary && typeof rawSummary === 'object') {
            const teamsRaw = Array.isArray(rawSummary.teams) ? rawSummary.teams : [];
            const teams: SalesTeamSummary[] = teamsRaw
              .filter((t): t is Record<string, unknown> => t != null && typeof t === 'object')
              .map((t) => ({
                id: parseString(t.id, ''),
                name: parseString(t.name, 'Unnamed'),
                memberCount: typeof t.memberCount === 'number' ? t.memberCount : parseNumber(t.memberCount),
              }))
              .filter((t) => t.id);
            setSalesSummary({
              teams,
              totalAgents: typeof rawSummary.totalAgents === 'number' ? rawSummary.totalAgents : parseNumber(rawSummary.totalAgents),
              activeAgents: typeof rawSummary.activeAgents === 'number' ? rawSummary.activeAgents : parseNumber(rawSummary.activeAgents),
            });
          } else {
            setSalesSummary({ teams: [], totalAgents: 0, activeAgents: 0 });
          }

          try {
            const jobsResponse = await fetch('/api/graphql', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: controller.signal,
              body: JSON.stringify({
                query: `query HomeSalesJobs($userId: Int!) {
                  salesJobs(userId: $userId) {
                    id assignedTo clientId agentName clientName jobType status createdAt
                  }
                }`,
                variables: { userId: user!.id },
              }),
            });
            if (controller.signal.aborted) return;
            if (!jobsResponse.ok) {
              setSalesJobs([]);
            } else {
              const jobsPayload = await jobsResponse.json();
              const rows = Array.isArray(jobsPayload?.data?.salesJobs) ? jobsPayload.data.salesJobs : [];
              setSalesJobs(
                rows
                  .filter((row: unknown): row is Record<string, unknown> => row != null && typeof row === 'object')
                  .map((row: Record<string, unknown>) => ({
                    id: parseString(row.id, ''),
                    assignedTo: parseString(row.assignedTo, ''),
                    clientId: parseString(row.clientId, ''),
                    agentName: parseString(row.agentName, ''),
                    clientName: parseString(row.clientName, ''),
                    jobType: parseString(row.jobType, ''),
                    status: parseString(row.status, 'pending'),
                    createdAt: parseString(row.createdAt, ''),
                  }))
                  .filter((row: HomeSalesJob) => row.id),
              );
            }
          } catch {
            if (!controller.signal.aborted) setSalesJobs([]);
          }
      } catch (fetchError) {
        if (
          !(fetchError instanceof DOMException && fetchError.name === 'AbortError')
        ) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : t('loadErrorFallback'),
          );
          setOrders([]);
          setProducts([]);
          setBuyers([]);
          setSuppliers([]);
          setSalesSummary(null);
          setSalesJobs([]);
        }
      } finally {
        // Only clear loading if THIS run wasn't aborted. When the effect re-runs
        // (Strict Mode double-invoke, user?.id changing null->X after hydration,
        // or AuthSync updating the user), the cleanup aborts the stale fetch. Its
        // finally must NOT flip loading=false, otherwise the skeleton disappears
        // and zero values flash while the newer fetch is still in flight.
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchData();
    return () => controller.abort();
  }, [user?.id, isHydrated, reloadCount]);

  // Use server-side aggregates (calculated from ALL orders) instead of client-side calculations
  // This ensures accuracy - aggregates are computed from the full dataset, not just the paginated subset
  const totalRevenue = useMemo(
    () => aggregates?.totalRevenue ?? 0,
    [aggregates],
  );

  const pendingRevenue = useMemo(
    () => aggregates?.pendingRevenue ?? 0,
    [aggregates],
  );

  // Calculate sales metrics from aggregates and limited order list for display
  // Note: Some metrics like repeatCustomerRate still need the order list for analysis
  const salesMetrics = useMemo(
    () => {
      if (!aggregates) {
        return calculateSalesMetrics(orders, products, hasData);
      }
      
      // Use aggregates for totals, but still calculate some metrics from order list
      const baseMetrics = calculateSalesMetrics(orders, products, hasData);
      return {
        ...baseMetrics,
        // Override with accurate aggregates from server
        totalOrders: aggregates.totalOrders,
        avgOrderValue: aggregates.avgOrderValue,
        totalPiecesSold: aggregates.totalPiecesSold,
        totalUnitsSold: aggregates.totalUnitsSold,
        uniqueCustomers: aggregates.uniqueCustomers,
        // Calculate derived metrics from aggregates
        avgPiecesPerOrder: aggregates.totalOrders > 0 
          ? aggregates.totalPiecesSold / aggregates.totalOrders 
          : 0,
        avgUnitsPerOrder: aggregates.totalOrders > 0
          ? aggregates.totalUnitsSold / aggregates.totalOrders
          : 0,
      };
    },
    [orders, products, hasData, aggregates],
  );

  const safeSalesMetrics = {
    uniqueCustomers: salesMetrics.uniqueCustomers ?? 0,
    repeatCustomerRate: salesMetrics.repeatCustomerRate ?? 0,
    avgOrderValue: salesMetrics.avgOrderValue ?? 0,
    totalOrders: salesMetrics.totalOrders ?? 0,
    avgPiecesPerOrder: salesMetrics.avgPiecesPerOrder ?? 0,
    totalPiecesSold: salesMetrics.totalPiecesSold ?? 0,
    avgUnitsPerOrder: salesMetrics.avgUnitsPerOrder ?? 0,
    totalUnitsSold: salesMetrics.totalUnitsSold ?? 0,
  };

const buyerInsights = useMemo(() => {
  const totalBuyers = buyers.length;
  const activeBuyers = buyers.filter(
    (buyer) => buyer.status?.toLowerCase() === 'active',
  ).length;

  const ordersByBuyer = new Map<
    string,
    { orders: number; revenue: number; pieces: number }
  >();

  orders.forEach((order) => {
    const key = order.buyerId;
    const current = ordersByBuyer.get(key) ?? {
      orders: 0,
      revenue: 0,
      pieces: 0,
    };
    current.orders += 1;
    current.revenue += order.totalAmount || 0;
    current.pieces += typeof order.totalOrders === 'number' ? order.totalOrders : 0;
    ordersByBuyer.set(key, current);
  });

  const topBuyers = Array.from(ordersByBuyer.entries())
    .map(([buyerId, stats]) => {
      const buyerRecord = buyers.find((buyer) => buyer.buyerId === buyerId);
      const displayName =
        buyerRecord?.storeName?.trim().length
          ? buyerRecord.storeName
          : buyerRecord?.owner?.trim().length
            ? buyerRecord.owner
            : buyerId;
      return {
        buyerId,
        name: displayName,
        orders: stats.orders,
        revenue: stats.revenue,
        pieces: stats.pieces,
        status: buyerRecord?.status ?? 'Unknown',
      };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 3);

  return {
    totalBuyers,
    activeBuyers,
    topBuyers,
  };
}, [buyers, orders]);

const supplierInsights = useMemo(() => {
  const totalSuppliers = suppliers.length;
  const activeSuppliers = suppliers.filter(
    (supplier) => supplier.status?.toLowerCase() === 'active',
  ).length;

  const valueBySupplier = new Map<string, number>();
  let onTimeSum = 0;
  let onTimeSamples = 0;

  suppliers.forEach((supplier) => {
    let supplierValue = 0;
    if (supplier.supplies) {
      const suppliesList = safeParseJSON(
        supplier.supplies,
        [],
      ) as SupplyDetail[];
      if (Array.isArray(suppliesList)) {
        suppliesList.forEach((supply) => {
          if (!supply) return;
          supplierValue += parseNumber(supply.totalValue);
        });
      }
    }
    const totalPurchases = parseNumber(supplier.totalPurchases);
    const totalSupplies = parseNumber(supplier.totalSupplies);
    const directOnTime = parseNumber(supplier.onTimeDeliveryRate);

    let effectiveValue = supplierValue;
    if (effectiveValue <= 0 && totalPurchases > 0) {
      effectiveValue = totalPurchases;
    }
    if (effectiveValue <= 0 && totalSupplies > 0) {
      effectiveValue = totalSupplies;
    }
    valueBySupplier.set(supplier.supplierId, effectiveValue);

    if (directOnTime > 0) {
      onTimeSum += directOnTime;
      onTimeSamples += 1;
    } else {
      let recordedFromLogistics = false;
      if (supplier.logistics) {
        const logisticsData = safeParseJSON(
          supplier.logistics,
          {} as Record<string, unknown>,
        );
        if (
          logisticsData &&
          typeof logisticsData === 'object' &&
          'deliverySuccess' in logisticsData
        ) {
          const logisticsRate = parseNumber(
            (logisticsData as { deliverySuccess?: unknown }).deliverySuccess,
          );
          if (logisticsRate > 0) {
            onTimeSum += logisticsRate;
            onTimeSamples += 1;
            recordedFromLogistics = true;
          }
        }
      }

      if (!recordedFromLogistics && supplier.supplies) {
        const suppliesList = safeParseJSON(
          supplier.supplies,
          [],
        ) as SupplyDetail[];
        if (Array.isArray(suppliesList)) {
          suppliesList.forEach((supply) => {
            const successRate = parseNumber(supply.deliverySuccess);
            if (successRate > 0) {
              onTimeSum += successRate;
              onTimeSamples += 1;
            }
          });
        }
      }
    }
  });

  const topSuppliers = Array.from(valueBySupplier.entries())
    .map(([supplierId, value]) => {
      const supplierRecord = suppliers.find(
        (supplier) => supplier.supplierId === supplierId,
      );
      return {
        supplierId,
        name: supplierRecord?.name ?? supplierId,
        value,
        status: supplierRecord?.status ?? 'Unknown',
      };
    })
    .filter((supplier) => supplier.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);

  const onTimeRate =
    onTimeSamples > 0 ? Math.round(onTimeSum / onTimeSamples) : 0;
  return {
    totalSuppliers,
    activeSuppliers,
    onTimeRate,
    topSuppliers,
  };
}, [suppliers]);

  const revenueTrendData = useMemo(
    () => calculateRevenueData(orders, products, hasData),
    [orders, products, hasData],
  );

  const topProducts = useMemo(
    () => calculateTopProducts(orders, products, hasData, MAX_PRODUCT_PERFORMANCE_ROWS),
    [orders, products, hasData],
  );

  const topProductsWithDetails = useMemo(() => {
    return topProducts.map((item, index) => {
      const product = products.find(
        (current) => current.productId === item.productId,
      );
      return {
        ...item,
        rank: index + 1,
        image: product?.images?.[0] ?? null,
        productName: product?.name ?? item.name,
        productCategory: product?.productCategory ?? item.productCategory,
      };
    });
  }, [topProducts, products]);

  const maxTopProductOrderVolume = useMemo(() => {
    return topProductsWithDetails.reduce(
      (max, product) => (product.orderVolume > max ? product.orderVolume : max),
      0,
    );
  }, [topProductsWithDetails]);

  const recentOrders = useMemo(() => {
    if (!hasData) {
      return [];
    }
    const sorted = [...orders].sort(
      (a, b) => b.orderDate.getTime() - a.orderDate.getTime(),
    );
  return sorted.slice(0, MAX_PIPELINE_ROWS);
  }, [orders, hasData]);

  const logisticsMapMarkers: LogisticsMapMarker[] = useMemo(() => {
    return logisticsActiveOrders
      .map((order) => {
        const addressKey = order.deliveryAddress?.trim() ?? '';
        if (!addressKey) {
          return null;
        }
        const geocodeResult = logisticsGeocodeResults.get(addressKey);
        if (!geocodeResult?.coordinates) {
          return null;
        }
        return {
          id: order.id,
          coordinates: geocodeResult.coordinates,
          label: `${order.orderId} • ${order.orderStatus}`,
          color: getOrderStatusMarkerColor(order.orderStatus),
        };
      })
      .filter((marker): marker is LogisticsMapMarker => marker !== null);
  }, [logisticsActiveOrders, logisticsGeocodeResults]);

  const logisticsMapCenter: MapCoordinates | undefined = useMemo(() => {
    if (logisticsMapMarkers.length === 0) {
      return undefined;
    }

    const averageLongitude =
      logisticsMapMarkers.reduce((sum, marker) => sum + marker.coordinates.longitude, 0) / logisticsMapMarkers.length;
    const averageLatitude =
      logisticsMapMarkers.reduce((sum, marker) => sum + marker.coordinates.latitude, 0) / logisticsMapMarkers.length;

    return {
      longitude: averageLongitude,
      latitude: averageLatitude,
    };
  }, [logisticsMapMarkers]);

  const handleLogisticsMarkerClick = (markerId: string) => {
    const order = orders.find((entry) => entry.id === markerId);
    if (order) {
      window.location.href = `/orders/details/${order.orderId}`;
    }
  };

  const orderGrowth = useMemo(() => computeOrdersListGrowth(orders), [orders]);
  const listedOrderVolume = useMemo(() => sumOrderVolume(orders), [orders]);

  const statCards = useMemo(() => {
    // Don't calculate if still loading to avoid showing 0 values
    if (loading) {
      return [];
    }
    const totalOrderCount = aggregates?.totalOrders ?? orders.length;
    const listCoversEveryOrder =
      aggregates != null && orders.length === aggregates.totalOrders;
    const orderVolume = listCoversEveryOrder
      ? listedOrderVolume
      : (aggregates?.totalRevenue ?? listedOrderVolume);
    const averageOrderVolume = totalOrderCount > 0 ? orderVolume / totalOrderCount : 0;
    return [
      {
        id: 'orderVolume',
        title: t('stats.orderVolume'),
        value: formatCurrency(orderVolume, userCurrency),
        change: orderGrowth.orderVolumeGrowth,
        currentValue: formatCompactCurrency(orderGrowth.orderVolumeCurrent, userCurrency),
        previousValue: formatCompactCurrency(orderGrowth.orderVolumePrevious, userCurrency),
        icon: <DollarSign className="w-6 h-6 text-[#0a61d7]" />,
        color: 'bg-[#f7faff]',
      },
      {
        id: 'totalOrders',
        title: t('stats.totalOrders'),
        value: totalOrderCount.toLocaleString(),
        change: orderGrowth.ordersGrowth,
        currentValue: orderGrowth.ordersCurrent.toLocaleString(),
        previousValue: orderGrowth.ordersPrevious.toLocaleString(),
        icon: <ShoppingCart className="w-6 h-6 text-[#0a61d7]" />,
        color: 'bg-[#f7faff]',
      },
      {
        id: 'piecesSold',
        title: t('stats.piecesSold'),
        value: safeSalesMetrics.totalUnitsSold.toLocaleString(),
        change: orderGrowth.piecesGrowth,
        currentValue: orderGrowth.piecesCurrent.toLocaleString(),
        previousValue: orderGrowth.piecesPrevious.toLocaleString(),
        icon: <Package className="w-6 h-6 text-[#0a61d7]" />,
        color: 'bg-[#f7faff]',
      },
      {
        id: 'averageOrderVolume',
        title: t('stats.averageOrderVolume'),
        value: formatCurrency(averageOrderVolume, userCurrency),
        change: orderGrowth.averageOrderVolumeGrowth,
        currentValue: formatCompactCurrency(orderGrowth.averageOrderVolumeCurrent, userCurrency),
        previousValue: formatCompactCurrency(orderGrowth.averageOrderVolumePrevious, userCurrency),
        icon: <DollarSign className="w-6 h-6 text-[#0a61d7]" />,
        color: 'bg-[#f7faff]',
      },
    ];
  }, [
    loading,
    aggregates,
    safeSalesMetrics.totalUnitsSold,
    listedOrderVolume,
    userCurrency,
    orders.length,
    orderGrowth,
    t,
  ]);

  const handleDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    id: WidgetId,
  ) => {
    setDraggingWidget(id);
    setDraggingSource('layout');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
    event.dataTransfer.setData('application/widget-source', 'layout');
  };

  const handleDragEnter = (id: WidgetId) => {
    if (draggingWidget && draggingWidget !== id) {
      setHoverWidget(id);
    }
  };

  const handleDragLeave = (id: WidgetId) => {
    if (hoverWidget === id) {
      setHoverWidget(null);
    }
  };

  const handleLibraryDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    id: WidgetId,
  ) => {
    setDraggingWidget(id);
    setDraggingSource('library');
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('text/plain', id);
    event.dataTransfer.setData('application/widget-source', 'library');
  };

  const getDragContext = (
    event: React.DragEvent,
  ): { sourceId: WidgetId | null; sourceType: 'layout' | 'library' } => {
    const rawId = draggingWidget ?? (event.dataTransfer.getData('text/plain') as WidgetId);
    if (!rawId) {
      return { sourceId: null, sourceType: 'layout' };
    }

    const rawSource =
      draggingSource ??
      (event.dataTransfer.getData('application/widget-source') as 'layout' | 'library');

    const normalizedSource = rawSource === 'library' ? 'library' : 'layout';

    if (normalizedSource === 'library' && widgetOrder.includes(rawId)) {
      return { sourceId: rawId, sourceType: 'layout' };
    }

    return { sourceId: rawId, sourceType: normalizedSource };
  };

  const handleDrop = (
    event: React.DragEvent<HTMLDivElement>,
    targetId: WidgetId,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const { sourceId, sourceType } = getDragContext(event);
    if (!sourceId) {
      handleDragEnd();
      return;
    }

    if (sourceType === 'layout') {
      if (sourceId === targetId) {
        handleDragEnd();
        return;
      }
      if (!widgetOrder.includes(sourceId) || !widgetOrder.includes(targetId)) {
        handleDragEnd();
        return;
      }
      setWidgetOrder((prev) => {
        const next = [...prev];
        const fromIndex = next.indexOf(sourceId);
        const toIndex = next.indexOf(targetId);
        if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
          return prev;
        }
        next.splice(fromIndex, 1);
        // Place widget exactly where user dropped it. After removal: moving right and adjacent → insert at toIndex; moving right and not adjacent → insert at toIndex-1; moving left → insert at toIndex.
        const movingRight = fromIndex < toIndex;
        const insertAt = movingRight
          ? (toIndex === fromIndex + 1 ? toIndex : toIndex - 1)
          : toIndex;
        next.splice(insertAt, 0, sourceId);
        return next;
      });
    } else {
      setWidgetOrder((prev) => {
        if (prev.includes(sourceId)) {
          return prev;
        }
        const next = [...prev];
        const insertAt = next.indexOf(targetId);
        if (insertAt === -1) {
          next.push(sourceId);
        } else {
          next.splice(insertAt, 0, sourceId);
        }
        return next;
      });
    }

    handleDragEnd();
  };

  const handleDragEnd = () => {
    setDraggingWidget(null);
    setHoverWidget(null);
    setDraggingSource(null);
  };

  const handleDropToEnd = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const { sourceId, sourceType } = getDragContext(event);
    if (!sourceId) {
      handleDragEnd();
      return;
    }

    if (sourceType === 'layout') {
      if (!widgetOrder.includes(sourceId)) {
        handleDragEnd();
        return;
      }
      setWidgetOrder((prev) => {
        const next = prev.filter((id) => id !== sourceId);
        next.push(sourceId);
        return next;
      });
    } else {
      setWidgetOrder((prev) => (prev.includes(sourceId) ? prev : [...prev, sourceId]));
    }

    handleDragEnd();
  };

  const handleWidgetToggle = (id: WidgetId) => {
    setWidgetOrder((prev) => {
      if (prev.includes(id)) {
        return prev.filter((widgetId) => widgetId !== id);
      }
      return [...prev, id];
    });
  };

  const widgetAction = (href: string, label: string) => (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-xs font-semibold text-[#0a61d7] hover:text-[#084ba6]"
    >
      {label}
      <ArrowRight className="w-4 h-4" />
    </Link>
  );

  const renderWidget = (id: WidgetId): WidgetRenderResult => {
    switch (id) {
      case 'conversion':
        return {
          action: widgetAction('/sales', widgetText('conversion', 'action')),
          content: (
            <SalesConversionEngineWidget
              orders={orders}
              buyers={buyers}
              salesJobs={salesJobs}
              currency={userCurrency}
              embedded
            />
          ),
        };
      case 'opportunities':
        return {
          action: widgetAction('/products/opportunities', widgetText('opportunities', 'action')),
          content: <AssortmentOpportunitiesWidget />,
        };
      case 'analytics':
        return {
          action: widgetAction('/analytics', widgetText('analytics', 'action')),
          content: (
            <AnalyticsWidget
              revenueData={revenueTrendData}
              totalRevenue={totalRevenue}
              userCurrency={userCurrency}
              hasData={hasData}
            />
          ),
        };
      case 'orders':
        return {
          action: widgetAction('/orders', widgetText('orders', 'action')),
          content: (
            <OrdersWidget
              recentOrders={recentOrders}
              userCurrency={userCurrency}
              mapboxToken={mapboxToken}
              logisticsMapMarkers={logisticsMapMarkers}
              logisticsMapCenter={logisticsMapCenter}
              isLogisticsGeocoding={isLogisticsGeocoding}
              onMarkerClick={handleLogisticsMarkerClick}
              formatOrderDate={formatOrderDate}
              translateOrderStatus={translateOrderStatus}
            />
          ),
        };
      case 'products':
        return {
          action: widgetAction('/products/list', widgetText('products', 'action')),
          content: (
            <ProductsWidget
              products={topProductsWithDetails}
              maxOrderVolume={maxTopProductOrderVolume}
              userCurrency={userCurrency}
            />
          ),
        };
      case 'buyers':
        return {
          action: widgetAction('/clients/buyers', widgetText('buyers', 'action')),
          content: (
            <BuyersWidget
              totalBuyers={buyerInsights.totalBuyers}
              activeBuyers={buyerInsights.activeBuyers}
              topBuyers={buyerInsights.topBuyers}
              avgOrderValue={safeSalesMetrics.avgOrderValue}
              totalOrders={safeSalesMetrics.totalOrders}
              totalPiecesSold={safeSalesMetrics.totalPiecesSold}
              totalUnitsSold={safeSalesMetrics.totalUnitsSold}
              userCurrency={userCurrency}
              translateRecordStatus={translateRecordStatus}
            />
          ),
        };
      case 'suppliers':
        return {
          action: widgetAction('/clients/suppliers', widgetText('suppliers', 'action')),
          content: (
            <SuppliersWidget
              totalSuppliers={supplierInsights.totalSuppliers}
              activeSuppliers={supplierInsights.activeSuppliers}
              onTimeRate={supplierInsights.onTimeRate}
              topSuppliers={supplierInsights.topSuppliers}
              userCurrency={userCurrency}
              translateRecordStatus={translateRecordStatus}
            />
          ),
        };
      case 'salesJobs':
        return {
          action: widgetAction('/sales/jobs', widgetText('salesJobs', 'action')),
          content: <SalesJobsWidget salesJobs={salesJobs} />,
        };
      case 'inventory':
        return {
          action: widgetAction('/products/list', widgetText('inventory', 'manageProducts')),
          content: <InventoryWidget products={products} />,
        };
      case 'sales':
        return {
          action: widgetAction('/sales', widgetText('sales', 'action')),
          content: <SalesWidget salesSummary={salesSummary} />,
        };
      default:
        return {
          content: (
            <div className="flex h-48 flex-col items-center justify-center rounded-lg">
              <Settings2 className="mb-3 h-10 w-10 text-gray-300" />
              <p className="text-sm font-semibold text-gray-600">{t('widgetNotFound')}</p>
              <p className="mt-1 text-xs text-gray-500">{t('widgetNotFoundHint')}</p>
            </div>
          ),
        };
    }
  };

  const getWidgetMeta = (widgetId: WidgetId) =>
    WIDGET_LIBRARY.find((widget) => widget.id === widgetId);

  const activeWidgets: WidgetId[] = widgetOrder;

  const renderedWidgets: React.ReactNode =
    activeWidgets.length === 0
      ? (
          <div className="col-span-1 @4xl/main:col-span-2 flex min-h-[320px] flex-col items-center justify-center rounded-lg bg-white text-center">
            <Settings2 className="mb-3 h-8 w-8 text-[#0a61d7]" />
            <p className="text-sm font-semibold text-black">
              {t('noWidgetsSelected')}
            </p>
            <p className="text-xs text-gray-500">
              {t('noWidgetsSelectedHint')}
            </p>
          </div>
        )
      : activeWidgets.map((id) => {
          const meta = getWidgetMeta(id);
          if (!meta) {
            return null;
          }
          const { content, action } = renderWidget(id);
          const Icon = meta.icon;
          return (
            <div
              key={id}
              data-widget-id={id}
              draggable
              onDragStart={(event) => handleDragStart(event, id)}
              onDragEnter={() => handleDragEnter(id)}
              onDragLeave={() => handleDragLeave(id)}
              onDragEnd={handleDragEnd}
              onDrop={(event) => handleDrop(event, id)}
              onDragOver={(event) => event.preventDefault()}
              aria-grabbed={draggingWidget === id}
              className={`${UNIFORM_WIDGET_LAYOUT} min-w-0 rounded-lg transition-all ${
                id === 'conversion' ? '@4xl/main:col-span-2 min-h-[420px]' : ''
              } ${
                hoverWidget === id ? 'ring-2 ring-[#0a61d7]/60' : ''
              } ${draggingWidget === id ? 'opacity-75' : 'opacity-100'}`}
            >
              <article className="@container flex h-full min-w-0 flex-col overflow-hidden rounded-lg border border-[#e6e6e6] bg-white">
                <div className="flex min-w-0 items-start justify-between gap-3 border-b border-[#e6e6e6] px-4 py-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <button
                      type="button"
                      className="mt-0.5 shrink-0 text-gray-400 hover:text-[#0a61d7] focus:outline-none"
                      aria-label={tCommon('dragToReorder')}
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                    <div className="flex min-w-0 items-start gap-2">
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#f7faff] text-[#0a61d7]">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-sm font-semibold text-black">
                            {widgetName(id)}
                          </h2>
                          {id === 'opportunities' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#f7faff] px-2 py-0.5 text-[11px] font-semibold text-[#0a61d7]">
                              <Sparkles className="h-3 w-3" />
                              {widgetText('opportunities', 'aiAnalysis')}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                  {action ? <div className="shrink-0">{action}</div> : null}
                </div>
                <div className="min-w-0 overflow-hidden p-4">{content}</div>
              </article>
            </div>
          );
        });

  if (loading || !hasHydratedLayout) {
    return <SkeletonHomePage />;
  }

  if (error) {
    return (
      <div className="flex min-h-full w-full min-w-0 flex-col bg-gradient-to-b from-gray-50 to-white p-6">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-6">
            <h2 className="text-lg font-semibold text-rose-700">
              {t('loadErrorTitle')}
            </h2>
            <p className="mt-2 text-sm text-rose-600">{error}</p>
            <button
              type="button"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#0a61d7] px-4 py-2 text-sm font-semibold text-white hover:bg-[#084ba6]"
              onClick={() => {
                setError(null);
                setLoading(true);
                setOrders([]);
                setProducts([]);
                setBuyers([]);
                setSuppliers([]);
                setSalesSummary(null);
                setSalesJobs([]);
                setReloadCount((count) => count + 1);
              }}
            >
              {tCommon('retry')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {isWidgetManagerOpen && (
        <div
          ref={widgetManagerRef}
          className="bg-white"
        >
          <div className="flex items-start justify-between p-4 -mb-2">
            <div>
              <h3 className="text-md font-semibold text-black">{t('widgetLibrary')}</h3>
            </div>
            <button
              type="button"
              onClick={() => setIsWidgetManagerOpen(false)}
              className="rounded-full border border-gray-200 p-1 text-gray-500 transition hover:border-gray-300 hover:text-black"
              aria-label={tCommon('closeWidgetLibrary')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="overflow-x-auto p-4">
            <div className="flex min-w-full items-stretch gap-3">
              {WIDGET_LIBRARY.map((widget) => {
                const Icon = widget.icon;
                const isActive = widgetOrder.includes(widget.id);
                return (
                  <div
                    key={widget.id}
                    draggable
                    onDragStart={(event) => handleLibraryDragStart(event, widget.id)}
                    onDragEnd={handleDragEnd}
                    className={`group flex min-w-[22rem] max-w-[22rem] cursor-grab flex-col justify-between rounded-lg border border-[#e6e6e6] bg-white p-4 transition hover:border-[#0a61d7] active:cursor-grabbing ${
                      isActive ? 'opacity-95' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f7faff] text-[#0a61d7]">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-black">
                          {widgetName(widget.id)}
                        </p>
                        <p className="text-xs text-gray-500">
                          {widgetDescription(widget.id)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-[11px] uppercase tracking-wide text-gray-400">
                        {isActive ? t('dragToReorder') : t('dragToAdd')}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleWidgetToggle(widget.id)}
                        className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                          isActive
                            ? 'border border-gray-200 text-gray-600 hover:border-rose-300 hover:text-rose-500'
                            : 'bg-[#0a61d7] text-white hover:bg-[#084ba6]'
                        }`}
                      >
                        {isActive ? tCommon('remove') : tCommon('add')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="flex min-h-full w-full min-w-0 flex-col bg-gradient-to-b from-gray-50 to-white p-4">
        <div className="flex min-w-0 w-full flex-col gap-3">
          <header className="flex flex-wrap items-center justify-between gap-4 mb-2">
            <div>
              <h1 className="text-2xl font-bold text-black mb-1">{t('title')}</h1>
              <p className="text-sm text-gray-600">{t('subtitle')}</p>
            </div>
            <button
              ref={widgetManagerToggleRef}
              type="button"
              onClick={() => setIsWidgetManagerOpen((prev) => !prev)}
              className="inline-flex items-center gap-2 rounded-lg border border-[#e6e6e6] bg-white px-3 py-2 text-xs font-semibold text-black transition hover:border-[#0a61d7]"
            >
              <Settings2 className="h-4 w-4 text-[#0a61d7]" />
              {t('dragWidgets')}
            </button>
          </header>

          {statCards.length > 0 && (
            <section className="grid grid-cols-1 gap-3 @3xl/main:grid-cols-2 @5xl/main:grid-cols-4">
              {statCards.map((card) => (
                <AnalyticsMetricCard
                  key={card.id}
                  title={card.title}
                  value={card.value}
                  change={card.change}
                  currentValue={card.currentValue}
                  previousValue={card.previousValue}
                  icon={card.icon}
                  color={card.color}
                  comparisonLabel={tCommon('vsLastMonth')}
                  naLabel={tCommon('notAvailable')}
                  thisMonthLabel={tCommon('thisMonth')}
                  lastMonthLabel={tCommon('vsLastMonth')}
                  vsLabel={tCommon('monthComparisonVs')}
                />
              ))}
            </section>
          )}

          <section
            className="grid grid-cols-1 gap-3 @4xl/main:grid-cols-2"
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDropToEnd}
          >
            {renderedWidgets}
          </section>
        </div>
      </div>
    </>
  );
}

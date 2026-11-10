'use client';
import { SkeletonTablePage } from '@/components/skeleton/SkeletonTablePage';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Statcards from '@/components/clientmanagement/Statcards';
import BuyerTable from "@/components/clientmanagement/BuyerTable";
import Link from 'next/link';
import { Plus, Upload, Download, RefreshCw, Check, AlertTriangle, GitCompare } from 'lucide-react';
import * as XLSX from 'xlsx';
import ImportData from '@/components/clientmanagement/ImportData';
import { useUserStore } from '@/store/userStore';
import { Buyer, BuyerTableRow, OrderDetail } from '@/types/client';
import { formatDate, formatNumber } from '@/utils/dateUtils';
import { logisticsLastVisit } from '@/utils/buyerLogistics';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useClientsTranslations } from '@/hooks/useClientsTranslations';
import { useSearchParams, useRouter } from 'next/navigation';

function downloadXLSX(wb: XLSX.WorkBook, filename: string) {
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/octet-stream' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

function profileToTableRow(buyer: Buyer): BuyerTableRow {
  let totalSpend = 0;
  let outstanding = 0;
  
  // Parse orderDetails from string to array
  const orderDetails = buyer.orderDetails ? (() => {
    try {
      return JSON.parse(buyer.orderDetails);
    } catch {
      return [];
    }
  })() : [];
  
  if (Array.isArray(orderDetails) && orderDetails.length > 0) {
          orderDetails.forEach((o: OrderDetail) => {
      // totalSpend already includes product cost + shipping fee
      totalSpend += parseInt((o.totalSpend || '').toString().replace(/[^\d]/g, '')) || 0;
    });
    outstanding = orderDetails.reduce((sum: number, o: OrderDetail) => sum + (parseInt((o.outstanding || '').toString().replace(/[^\d]/g, '')) || 0), 0);
  }
  
  return {
    id: buyer.id || 0,
    buyerId: buyer.buyerId,
    avatar: buyer.avatar,
    owner: buyer.owner,
    name: buyer.storeName,
    email: buyer.email,
    phone: buyer.phone,
    storeName: buyer.storeName,
    businessType: buyer.businessType,
    address: buyer.address,
    status: buyer.status,
    totalOrders: Array.isArray(orderDetails) ? orderDetails.reduce((sum: number, o: OrderDetail) => sum + (parseInt(o.totalOrders) || 0), 0).toString() : '0',
    totalSpend: totalSpend.toString(), // Return raw number as string, let BuyerTable format it
    outstanding: outstanding.toString(), // Return raw number as string, let BuyerTable format it
    lastVisit: logisticsLastVisit(buyer),
          createdAt: formatDate(buyer.createdAt),
      lastUpdated: formatDate(buyer.updatedAt),
    userId: buyer.userId || 0,
  };
}

function generateBuyerId() {
  return 'LKB-' + Math.floor(10000000 + Math.random() * 90000000).toString();
}

export default function BuyersPage() {
  const { tBuyers, tShared } = useClientsTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showImportModal, setShowImportModal] = useState(false);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOverlay, setShowOverlay] = useState(false);
  const [overlayMessage, setOverlayMessage] = useState('');
  const [isSlidingIn, setIsSlidingIn] = useState(false);
  const [isSlidingOut, setIsSlidingOut] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState('');
  const [updateError, setUpdateError] = useState('');
  const overlayTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasLoadedBuyersRef = useRef(false);
  const redirectedAddRef = useRef(false);
  const user = useUserStore(state => state.user);
  const [pendingMatches, setPendingMatches] = useState(0);

  useEffect(() => {
    if (redirectedAddRef.current) return;
    if (searchParams?.get('addBuyer') !== '1') return;
    redirectedAddRef.current = true;
    router.replace('/clients/buyers/add');
  }, [searchParams, router]);

  // Utility function to calculate monthly averages (same logic as BuyerProfile)
  const calculateMonthlyAverages = (orderDetails: OrderDetail[]) => {
    if (!orderDetails || orderDetails.length === 0) {
      return { avgMonthlyOrders: 0, avgMonthlySpending: 0 };
    }
    
    // Calculate total orders and spending
    let totalOrders = 0;
    let totalSpending = 0;
    
    orderDetails.forEach((order: OrderDetail) => {
      totalOrders += parseInt(order.totalOrders) || 0;
      totalSpending += parseInt((order.totalSpend || '0').toString().replace(/[^\d]/g, '')) || 0;
    });
    
    // Extract unique months from order dates
    const uniqueMonths = new Set();
    orderDetails.forEach((order: OrderDetail) => {
      if (order.lastOrderDate) {
        const monthKey = order.lastOrderDate.substring(0, 7); // Get YYYY-MM
        uniqueMonths.add(monthKey);
      }
    });
    
    const monthCount = uniqueMonths.size;
    
    // Calculate averages (same logic as BuyerProfile)
    const avgMonthlyOrders = monthCount > 0 ? Math.round(totalOrders / monthCount) : 0;
    const avgMonthlySpending = monthCount > 0 ? Math.round(totalSpending / monthCount) : 0;
    
    return { avgMonthlyOrders, avgMonthlySpending };
  };

  const BUYERS_QUERY = `
    query GetBuyers($userId: Int!, $page: Int, $limit: Int) {
      buyers(userId: $userId, page: $page, limit: $limit) {
        nodes {
          id
          buyerId
          avatar
          owner
          storeName
          email
          phone
          businessType
          address
          status
          logistics
          notes
          orderDetails
          avgMonthlySpending
          avgMonthlyOrders
          userId
          createdAt
          updatedAt
        }
        pagination {
          page
          limit
          totalCount
          totalPages
        }
      }
    }
  `;

  const fetchBuyers = useCallback(async () => {
    if (!user?.id) return;

    const isInitialLoad = !hasLoadedBuyersRef.current;

    if (isInitialLoad) {
      setLoading(true);
    }

    // Clear any existing timeouts
    if (overlayTimeoutRef.current) {
      clearTimeout(overlayTimeoutRef.current);
    }

    // For refresh after initial load, use overlay only (keep table mounted)
    if (!isInitialLoad) {
      setIsSlidingOut(false);
      setIsSlidingIn(true);
      setOverlayMessage(tBuyers('refreshing'));
    }
    
    try {
      const data = await fetchGraphQL<{
        buyers: {
          nodes: Buyer[];
          pagination: {
            page: number;
            limit: number;
            totalCount: number;
            totalPages: number;
          };
        };
      }>(BUYERS_QUERY, {
        userId: user.id,
        page: 1,
        limit: 1000,
      });
      
      const buyersData = data.buyers.nodes;
      
      // Calculate monthly analytics for each buyer
      const buyersWithAnalytics = buyersData.map((buyer: Buyer) => {
        const orderDetails = buyer.orderDetails ? JSON.parse(buyer.orderDetails) : [];
        
        // Calculate monthly averages using the same logic as BuyerProfile
        const { avgMonthlyOrders, avgMonthlySpending } = calculateMonthlyAverages(orderDetails);
        
        return {
          ...buyer,
          avgMonthlyOrders,
          avgMonthlySpending
        };
      });
      
      // Buyers data processed with analytics
      setBuyers(buyersWithAnalytics);
      hasLoadedBuyersRef.current = true;
      setOverlayMessage(tBuyers('showingData', { count: buyersWithAnalytics.length }));
    } catch (error) {
      // Error fetching buyers
      console.error('Error loading buyers:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setBuyers([]);
      setOverlayMessage(tBuyers('errorLoading', { error: errorMessage }));
    } finally {
      setLoading(false);
      
      // Complete slide-in animation and show overlay
      setTimeout(() => {
        setIsSlidingIn(false);
        setShowOverlay(true);
      }, 1500);
      
      // Auto-hide overlay after 2.5 seconds
      overlayTimeoutRef.current = setTimeout(() => {
        // Start slide-out animation
        setIsSlidingOut(true);
        setShowOverlay(false);
        
        // Remove overlay completely after animation
        setTimeout(() => {
          setIsSlidingOut(false);
        }, 500);
      }, 2500);
    }
  }, [user?.id, tBuyers]);

  useEffect(() => {
    // Start slide-in animation immediately for initial page load
    setIsSlidingIn(true);
    setOverlayMessage(tBuyers('loadingData'));
    
    fetchBuyers();
    
    // Cleanup timeout on unmount
    return () => {
      if (overlayTimeoutRef.current) {
        clearTimeout(overlayTimeoutRef.current);
      }
    };
  }, [user?.id, fetchBuyers]);

  useEffect(() => {
    if (!user?.id) return;
    fetchGraphQL<{ clientMatchPendingCount: number }>(
      `query MatchCount($userId: Int!) { clientMatchPendingCount(userId: $userId) }`,
      { userId: user.id },
    )
      .then((data) => setPendingMatches(data.clientMatchPendingCount || 0))
      .catch(() => setPendingMatches(0));
  }, [user?.id]);

  // Auto-hide success and error messages
  useEffect(() => {
    if (updateSuccess) {
      const timer = setTimeout(() => setUpdateSuccess(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [updateSuccess]);

  useEffect(() => {
    if (updateError) {
      const timer = setTimeout(() => setUpdateError(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [updateError]);

  if (loading && !hasLoadedBuyersRef.current) {
    return <SkeletonTablePage statCards={4} rows={8} />;
  }

  return (
    <div className="flex min-h-full w-full min-w-0 flex-col bg-gradient-to-b from-gray-50 to-white p-4">
      <div className="mb-4 flex min-w-0 flex-col gap-4 @5xl/main:flex-row @5xl/main:items-center @5xl/main:justify-between">
        <div className="min-w-0">
          <h2 className="mb-2 truncate text-2xl font-bold text-black">{tBuyers('title')}</h2>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-2 @4xl/main:flex-row @4xl/main:flex-wrap @4xl/main:items-center @5xl/main:w-auto">
          <button
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#e6e6e6] bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-gray-100 @4xl/main:w-auto"
            onClick={fetchBuyers}
            disabled={loading || isSlidingIn}
          >
            <RefreshCw className={`h-4 w-4 ${loading || isSlidingIn ? 'animate-spin' : ''}`} /> {tShared('refresh')}
          </button>
          <button
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#e6e6e6] bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-gray-100 @4xl/main:w-auto"
            onClick={() => setShowImportModal(true)}
          >
            <Upload className="h-4 w-4" /> {tShared('importData')}
          </button>
          <button
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#e6e6e6] bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-gray-100 @4xl/main:w-auto"
            onClick={() => document.getElementById('buyer-table-export-xlsx-trigger')?.click()}
          >
            <Download className="h-4 w-4" /> {tShared('exportData')}
          </button>
          <Link
            href="/clients/buyers/buyer-matching"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#e6e6e6] bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-gray-100 @4xl/main:w-auto"
          >
            <GitCompare className="h-4 w-4" /> {tBuyers('matchBuyers')}
            {pendingMatches > 0 && (
              <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-[#0a61d7] px-1.5 py-0.5 text-[10px] font-bold text-white">
                {pendingMatches > 99 ? '99+' : pendingMatches}
              </span>
            )}
          </Link>
          <Link
            href="/clients/buyers/add"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0a61d7] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#084ba6] @4xl/main:w-auto"
          >
            <Plus className="h-4 w-4" /> {tBuyers('addBuyer')}
          </Link>
        </div>
      </div>
      {/* Success and Error Messages */}
      {updateSuccess && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
          <Check className="w-5 h-5 text-green-500" />
          <span className="text-green-700 text-sm">{updateSuccess}</span>
        </div>
      )}
      
      {updateError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          <span className="text-red-700 text-sm">{updateError}</span>
        </div>
      )}
      
      {/* Data Status Overlay */}
      {(showOverlay || isSlidingIn || isSlidingOut) && (
        <div className={`fixed top-20 right-6 z-50 bg-white border border-green-300 rounded-lg shadow-lg p-4 min-w-[280px] transform transition-all duration-500 ease-out ${
          isSlidingIn ? 'translate-x-0 opacity-100' : 
          isSlidingOut ? 'translate-x-full opacity-0' : 
          'translate-x-full opacity-0'
        }`}>
          <div className="flex items-center gap-3">
            {loading || isSlidingIn ? (
              <div className="w-5 h-5 border-2 border-[#0a61d7] border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                <Check className="w-4 h-4 text-white" />
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-gray-900">{overlayMessage}</p>
              <p className="text-xs text-gray-500">
                {loading || isSlidingIn ? tShared('pleaseWait') : tBuyers('loaded', { count: buyers.length })}
              </p>
            </div>
          </div>
        </div>
      )}
      
          <Statcards type="buyer" data={buyers} />
          <BuyerTable buyers={buyers} setBuyers={setBuyers} onExportXLSX={downloadXLSX} profileToTableRow={profileToTableRow} onRefresh={fetchBuyers} />
      <ImportData
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImport={async (data) => {
          try {
            if (!user?.id) return;

            setLoading(true);
            setIsSlidingOut(false);
            setIsSlidingIn(true);
            setOverlayMessage(tBuyers('importing'));
            setShowOverlay(true);

            const buyers = data.map((buyer) => {
              const row = buyer as Record<string, unknown>;
              const pick = (...keys: string[]) => {
                for (const key of keys) {
                  const value = row[key];
                  if (value !== undefined && value !== null && String(value).trim() !== '') {
                    return String(value);
                  }
                }
                return undefined;
              };

              const additionalFields: Record<string, string> = {};
              Object.keys(row).forEach((key) => {
                if (
                  [
                    'ID',
                    'id',
                    'buyerId',
                    'Store Name',
                    'storeName',
                    'store',
                    'name',
                    'Owner',
                    'owner',
                    'contact',
                    'Email',
                    'email',
                    'Phone',
                    'phone',
                    'telephone',
                    'Business Type',
                    'businessType',
                    'type',
                    'Address',
                    'address',
                    'location',
                    'Status',
                    'status',
                    'Notes',
                    'notes',
                    'Order Details',
                    'orderDetails',
                    'orders',
                  ].includes(key)
                ) {
                  return;
                }
                const value = row[key];
                if (value !== undefined && value !== null && String(value).trim() !== '') {
                  additionalFields[key] = String(value);
                }
              });

              const notesValue = pick('Notes', 'notes', 'comments', 'Comments', 'tags', 'Tags');
              const orderDetailsValue = pick('Order Details', 'orderDetails', 'orders');

              return {
                buyerId: pick('ID', 'id', 'buyerId') || generateBuyerId(),
                storeName: pick('Store Name', 'storeName', 'store', 'name'),
                owner: pick('Owner', 'owner', 'contact'),
                email: pick('Email', 'email'),
                phone: pick('Phone', 'phone', 'telephone'),
                businessType: pick('Business Type', 'businessType', 'type'),
                address: pick('Address', 'address', 'location'),
                status: pick('Status', 'status'),
                logistics:
                  Object.keys(additionalFields).length > 0
                    ? JSON.stringify(additionalFields)
                    : undefined,
                notes: notesValue ? JSON.stringify([notesValue]) : undefined,
                orderDetails: orderDetailsValue
                  ? typeof orderDetailsValue === 'string' && orderDetailsValue.trim().startsWith('[')
                    ? orderDetailsValue
                    : JSON.stringify(orderDetailsValue)
                  : undefined,
              };
            });

            const BULK_IMPORT_BATCH_SIZE = 1000;
            let successCount = 0;
            let errorCount = 0;
            let failureMessage = '';
            for (let offset = 0; offset < buyers.length; offset += BULK_IMPORT_BATCH_SIZE) {
              const batch = buyers.slice(offset, offset + BULK_IMPORT_BATCH_SIZE);
              try {
                const result = await fetchGraphQL<{
                  bulkCreateBuyers: {
                    success: boolean;
                    successCount: number;
                    failedCount: number;
                    message?: string | null;
                  };
                }>(
                  `
                    mutation BulkCreateBuyers($userId: Int!, $buyers: [BulkBuyerInput!]!) {
                      bulkCreateBuyers(userId: $userId, buyers: $buyers) {
                        success
                        successCount
                        failedCount
                        message
                      }
                    }
                  `,
                  { userId: user.id, buyers: batch },
                );
                const payload = result.bulkCreateBuyers;
                const batchSuccess = payload?.successCount ?? 0;
                const batchFailed = payload?.failedCount ?? 0;

                if (payload && payload.success === false) {
                  successCount += batchSuccess;
                  errorCount +=
                    batchFailed > 0 ? batchFailed : Math.max(0, batch.length - batchSuccess);
                  if (payload.message) failureMessage = payload.message;
                  continue;
                }

                successCount += batchSuccess;
                errorCount += batchFailed;
              } catch (error) {
                // Keep counts from completed batches; only this batch is treated as failed.
                errorCount += batch.length;
                if (!failureMessage) {
                  failureMessage =
                    error instanceof Error && error.message
                      ? error.message
                      : tBuyers('importFailed');
                }
              }
            }

            if (successCount > 0) {
              setUpdateSuccess(tBuyers('importSuccess', { count: successCount }));
            }
            if (errorCount > 0) {
              setUpdateError(
                failureMessage
                  ? `${tBuyers('importFailedCount', { count: errorCount })} ${failureMessage}`
                  : tBuyers('importFailedCount', { count: errorCount }),
              );
            }

            await fetchBuyers();
          } catch {
            setUpdateError(tBuyers('importFailed'));
            setIsSlidingIn(false);
            setIsSlidingOut(false);
            setShowOverlay(false);
          } finally {
            setLoading(false);
          }
        }}
        type="Buyers"
      />
    </div>
  );
}
  
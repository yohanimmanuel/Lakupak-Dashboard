'use client';
import { SkeletonTablePage } from '@/components/skeleton/SkeletonTablePage';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Statcards from '@/components/clientmanagement/Statcards';
import SupplierTable from "@/components/clientmanagement/SupplierTable";
import Link from 'next/link';
import { Plus, Upload, Download, Check } from 'lucide-react';
import * as XLSX from 'xlsx';
import ImportData from '@/components/clientmanagement/ImportData';
import { useUserStore } from '@/store/userStore';
import { Supplier, SupplierTableRow, SupplyDetail } from '@/types/client';
import { formatNumber } from '@/utils/dateUtils';
import { generateUniqueSupplierId } from '@/utils/supplier-security';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useClientsTranslations } from '@/hooks/useClientsTranslations';

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

function profileToTableRow(supplier: Supplier): SupplierTableRow {
  let totalPurchases = 0;
  let totalSupplied = 0;
  
  // Parse supplies from string to array
  const supplies = supplier.supplies ? (() => {
    try {
      return JSON.parse(supplier.supplies);
    } catch {
      return [];
    }
  })() : [];
  
  if (Array.isArray(supplies) && supplies.length > 0) {
    supplies.forEach((s: SupplyDetail) => {
      totalPurchases += parseInt((s.totalValue || '').toString().replace(/[^-\d]/g, '')) || 0;
    });
    totalSupplied = supplies.reduce((sum: number, s: SupplyDetail) => sum + (parseInt(s.totalSupplied) || 0), 0);
  }
  
  return {
    id: supplier.id || 0,
    supplierId: supplier.supplierId,
    name: supplier.name,
    contact: supplier.contact,
    email: supplier.email,
    phone: supplier.phone,
    businessType: supplier.businessType,
    address: supplier.address,
    totalPurchases: totalPurchases.toString(), // Return raw number as string, let SupplierTable format it
    totalSupplies: totalSupplied,
    createdAt: supplier.createdAt ? new Date(supplier.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    status: supplier.status,
    lastUpdated: supplier.updatedAt ? new Date(supplier.updatedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    userId: supplier.userId || 0,
  };
}

export default function SuppliersPage() {
  const { tSuppliers, tShared } = useClientsTranslations();
  const [showImportModal, setShowImportModal] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOverlay, setShowOverlay] = useState(false);
  const [overlayMessage, setOverlayMessage] = useState('');
  const [isSlidingIn, setIsSlidingIn] = useState(false);
  const [isSlidingOut, setIsSlidingOut] = useState(false);
  const overlayTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasLoadedSuppliersRef = useRef(false);
  const user = useUserStore(state => state.user);

  // Utility function to calculate monthly averages (same logic as SupplierProfile)
  const calculateMonthlyAverages = (supplies: SupplyDetail[]) => {
    if (!supplies || supplies.length === 0) {
      return { avgMonthlyPurchaseValue: 0, avgMonthlySupplied: 0 };
    }
    
    // Calculate total purchase value and supplied
    let totalPurchaseValue = 0;
    let totalSupplied = 0;
    
    supplies.forEach((supply: SupplyDetail) => {
      totalPurchaseValue += parseInt((supply.totalValue || '0').toString().replace(/[^\d]/g, '')) || 0;
      totalSupplied += parseInt(supply.totalSupplied) || 0;
    });
    
    // Extract unique months from delivery dates
    const uniqueMonths = new Set();
    supplies.forEach((supply: SupplyDetail) => {
      if (supply.lastDelivery) {
        const monthKey = supply.lastDelivery.substring(0, 7); // Get YYYY-MM
        uniqueMonths.add(monthKey);
      }
    });
    
    const monthCount = uniqueMonths.size;
    
    // Calculate averages (same logic as SupplierProfile)
    const avgMonthlyPurchaseValue = monthCount > 0 ? Math.round(totalPurchaseValue / monthCount) : 0;
    const avgMonthlySupplied = monthCount > 0 ? Math.round(totalSupplied / monthCount) : 0;
    
    return { avgMonthlyPurchaseValue, avgMonthlySupplied };
  };

  // GraphQL query to fetch suppliers - moved outside function to prevent recreation
  const SUPPLIERS_QUERY = `
    query GetSuppliers($userId: Int!, $page: Int, $limit: Int) {
      suppliers(userId: $userId, page: $page, limit: $limit) {
        nodes {
          id
          supplierId
          name
          contact
          email
          phone
          businessType
          address
          status
          logistics
          notes
          supplies
          avgMonthlyPurchaseValue
          totalPurchases
          totalSupplies
          onTimeDeliveryRate
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

  const fetchSuppliers = useCallback(async () => {
    if (!user?.id) return;

    const isInitialLoad = !hasLoadedSuppliersRef.current;

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
      setOverlayMessage(tSuppliers('refreshing'));
    }
    
    try {
      const data = await fetchGraphQL<{
        suppliers: {
          nodes: Supplier[];
          pagination: {
            page: number;
            limit: number;
            totalCount: number;
            totalPages: number;
          };
        };
      }>(SUPPLIERS_QUERY, {
        userId: user.id,
        page: 1,
        limit: 1000,
      });
      
      const suppliersData = data.suppliers.nodes;
      
      // Calculate monthly analytics for each supplier
      const suppliersWithAnalytics = suppliersData.map((supplier: Supplier) => {
        const supplies = supplier.supplies ? JSON.parse(supplier.supplies) : [];
        
        // Calculate monthly averages using the same logic as SupplierProfile
        const { avgMonthlyPurchaseValue, avgMonthlySupplied } = calculateMonthlyAverages(supplies);
        
        return {
          ...supplier,
          avgMonthlyPurchaseValue,
          avgMonthlySupplied
        };
      });
      
      // Suppliers data processed with analytics
      setSuppliers(suppliersWithAnalytics);
      hasLoadedSuppliersRef.current = true;
      setOverlayMessage(tSuppliers('showingData', { count: suppliersWithAnalytics.length }));
    } catch (error) {
      // Error fetching suppliers
      console.error('Error loading suppliers:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setSuppliers([]);
      setOverlayMessage(tSuppliers('errorLoading', { error: errorMessage }));
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
  }, [user?.id, tSuppliers]);

  useEffect(() => {
    // Start slide-in animation immediately for initial page load
    setIsSlidingIn(true);
    setOverlayMessage(tSuppliers('loadingData'));
    
    fetchSuppliers();
    
    // Cleanup timeout on unmount
    return () => {
      if (overlayTimeoutRef.current) {
        clearTimeout(overlayTimeoutRef.current);
      }
    };
  }, [fetchSuppliers]); // Now fetchSuppliers is properly memoized, so we can include it

  if (loading && !hasLoadedSuppliersRef.current) {
    return <SkeletonTablePage statCards={4} rows={8} />;
  }

  return (
    <div className="flex min-h-full w-full min-w-0 flex-col bg-gradient-to-b from-gray-50 to-white p-4">
      <div className="mb-4 flex min-w-0 flex-col gap-4 @5xl/main:flex-row @5xl/main:items-center @5xl/main:justify-between">
        <div className="min-w-0">
          <h2 className="mb-2 truncate text-2xl font-bold text-black">{tSuppliers('title')}</h2>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-2 @4xl/main:flex-row @4xl/main:flex-wrap @4xl/main:items-center @5xl/main:w-auto">
          <button
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#e6e6e6] bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 @4xl/main:w-auto"
            onClick={fetchSuppliers}
            disabled={loading || isSlidingIn}
          >
            <svg className={`h-4 w-4 ${loading || isSlidingIn ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg> {tShared('refresh')}
          </button>
          <button
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#e6e6e6] bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-gray-100 @4xl/main:w-auto"
            onClick={() => setShowImportModal(true)}
          >
            <Upload className="h-4 w-4" /> {tShared('importData')}
          </button>
          <button
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#e6e6e6] bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-gray-100 @4xl/main:w-auto"
            onClick={() => document.getElementById('supplier-table-export-xlsx-trigger')?.click()}
          >
            <Download className="h-4 w-4" /> {tShared('exportData')}
          </button>
          <Link
            href="/clients/suppliers/add"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0a61d7] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#084ba6] @4xl/main:w-auto"
          >
            <Plus className="h-4 w-4" /> {tSuppliers('addSupplier')}
          </Link>
        </div>
      </div>
          <Statcards type="supplier" data={suppliers} />
          <SupplierTable suppliers={suppliers} setSuppliers={setSuppliers} onExportXLSX={downloadXLSX} profileToTableRow={profileToTableRow} onRefresh={fetchSuppliers} />
      <ImportData
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImport={async (data) => {
          try {
            if (!user?.id) return;

            setLoading(true);
            setIsSlidingOut(false);
            setIsSlidingIn(true);
            setOverlayMessage(tSuppliers('importing'));
            setShowOverlay(true);

            const suppliersPayload = data.map((supplier) => {
              const row = supplier as Record<string, unknown>;
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
                    'supplierId',
                    'Supplier Name',
                    'name',
                    'supplier',
                    'Name',
                    'Contact',
                    'contact',
                    'Contact Person',
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
                    'Supplies',
                    'supplies',
                    'products',
                    'Products',
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
              const suppliesValue = pick('Supplies', 'supplies', 'products', 'Products');

              return {
                supplierId: pick('ID', 'id', 'supplierId') || generateUniqueSupplierId(),
                name: pick('Supplier Name', 'name', 'supplier', 'Name'),
                contact: pick('Contact', 'contact', 'Contact Person'),
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
                supplies: suppliesValue
                  ? typeof suppliesValue === 'string' && suppliesValue.trim().startsWith('[')
                    ? suppliesValue
                    : JSON.stringify(suppliesValue)
                  : undefined,
              };
            });

            const BULK_IMPORT_BATCH_SIZE = 1000;
            let successCount = 0;
            let errorCount = 0;
            let failureMessage = '';
            for (let offset = 0; offset < suppliersPayload.length; offset += BULK_IMPORT_BATCH_SIZE) {
              const batch = suppliersPayload.slice(offset, offset + BULK_IMPORT_BATCH_SIZE);
              try {
                const result = await fetchGraphQL<{
                  bulkCreateSuppliers: {
                    success: boolean;
                    successCount: number;
                    failedCount: number;
                    message?: string | null;
                  };
                }>(
                  `
                    mutation BulkCreateSuppliers($userId: Int!, $suppliers: [BulkSupplierInput!]!) {
                      bulkCreateSuppliers(userId: $userId, suppliers: $suppliers) {
                        success
                        successCount
                        failedCount
                        message
                      }
                    }
                  `,
                  { userId: user.id, suppliers: batch },
                );
                const payload = result.bulkCreateSuppliers;
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
                      : tSuppliers('importFailed');
                }
              }
            }

            let importResultMessage = '';
            if (successCount > 0) {
              const totalsMessage =
                errorCount > 0
                  ? `${tSuppliers('importSuccess', { count: successCount })} ${tSuppliers('importFailedCount', { count: errorCount })}`
                  : tSuppliers('importSuccess', { count: successCount });
              importResultMessage = failureMessage
                ? `${totalsMessage} ${failureMessage}`
                : totalsMessage;
            } else if (errorCount > 0) {
              importResultMessage = failureMessage
                ? `${tSuppliers('importFailedCount', { count: errorCount })} ${failureMessage}`
                : tSuppliers('importFailedCount', { count: errorCount });
            }

            await fetchSuppliers();

            // Show import totals after refresh so fetchSuppliers does not overwrite them.
            if (importResultMessage) {
              if (overlayTimeoutRef.current) {
                clearTimeout(overlayTimeoutRef.current);
              }
              setOverlayMessage(importResultMessage);
              setShowOverlay(true);
              setIsSlidingIn(false);
              setIsSlidingOut(false);
              overlayTimeoutRef.current = setTimeout(() => {
                setIsSlidingOut(true);
                setShowOverlay(false);
                setTimeout(() => {
                  setIsSlidingOut(false);
                }, 500);
              }, 2500);
            }
          } catch {
            setOverlayMessage(tSuppliers('importFailed'));
            setShowOverlay(true);
            setIsSlidingIn(false);
            setIsSlidingOut(false);
            if (overlayTimeoutRef.current) {
              clearTimeout(overlayTimeoutRef.current);
            }
            overlayTimeoutRef.current = setTimeout(() => {
              setIsSlidingOut(true);
              setShowOverlay(false);
              setTimeout(() => {
                setIsSlidingOut(false);
              }, 500);
            }, 2500);
          } finally {
            setLoading(false);
          }
        }}
        type="Suppliers"
      />
      
      {/* Data Status Overlay */}
      {(showOverlay || isSlidingIn || isSlidingOut) && (
        <div className={`fixed top-20 right-6 z-50 bg-white border border-green-300 rounded-lg shadow-lg p-4 min-w-[280px] transform transition-all duration-500 ease-out ${
          isSlidingOut
            ? 'translate-x-full opacity-0'
            : isSlidingIn || showOverlay
              ? 'translate-x-0 opacity-100'
              : 'translate-x-full opacity-0'
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
                {loading || isSlidingIn ? tShared('pleaseWait') : tSuppliers('loaded', { count: suppliers.length })}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
  
'use client';
import { SkeletonTablePage } from '@/components/skeleton/SkeletonTablePage';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Statcards from '@/components/clientmanagement/Statcards';
import SupplierTable from "@/components/clientmanagement/SupplierTable";
import SupplierModal from '@/components/clientmanagement/SupplierModal';
import { Plus, Upload, Download, Check } from 'lucide-react';
import * as XLSX from 'xlsx';
import ImportData from '@/components/clientmanagement/ImportData';
import { useUserStore } from '@/store/userStore';
import { Supplier, SupplierTableRow, SupplyDetail, SupplierFormData } from '@/types/client';
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
  const [showAddModal, setShowAddModal] = useState(false);
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
    <div className="p-4 w-full min-h-screen flex flex-col items-right bg-gradient-to-b from-gray-50 to-white">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
        <div>
          <h2 className="text-2xl font-bold text-black mb-2">{tSuppliers('title')}</h2>
        </div>
        <div className="flex gap-2 items-center">
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-[#e6e6e6] text-black font-medium hover:bg-gray-100 transition text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={fetchSuppliers}
            disabled={loading || isSlidingIn}
          >
            <svg className={`w-4 h-4 ${loading || isSlidingIn ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg> {tShared('refresh')}
          </button>
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-[#e6e6e6] text-black font-medium hover:bg-gray-100 transition text-sm"
            onClick={() => setShowImportModal(true)}
          >
            <Upload className="w-4 h-4" /> {tShared('importData')}
          </button>
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-[#e6e6e6] text-black font-medium hover:bg-gray-100 transition text-sm"
            onClick={() => document.getElementById('supplier-table-export-xlsx-trigger')?.click()}
          >
            <Download className="w-4 h-4" /> {tShared('exportData')}
          </button>
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0a61d7] text-white font-semibold hover:bg-[#084ba6] transition text-sm"
            onClick={() => setShowAddModal(true)}
          >
            <Plus className="w-4 h-4" /> {tSuppliers('addSupplier')}
          </button>
        </div>
      </div>
          <Statcards type="supplier" data={suppliers} />
          <SupplierTable suppliers={suppliers} setSuppliers={setSuppliers} onExportXLSX={downloadXLSX} profileToTableRow={profileToTableRow} onRefresh={fetchSuppliers} />
      <SupplierModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={async (data) => {
          setShowAddModal(false);
          await fetchSuppliers();
          // Force a page refresh to ensure all data is up to date
          window.location.reload();
        }}
      />
      <ImportData
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImport={async (data) => {
          try {
            setShowImportModal(false);
            if (!user?.id) return;
            
            // Show loading state
            setLoading(true);
            
            let successCount = 0;
            let errorCount = 0;
            
            for (const supplier of data) {
              try {
                
                // Extract all available data from the supplier object dynamically
                const extractData = (obj: Record<string, unknown>): Record<string, string> => {
                  const extracted: Record<string, string> = {};
                  
                  // Get all keys from the supplier data
                  Object.keys(obj).forEach(key => {
                    const value = obj[key];
                    if (value !== undefined && value !== null && value !== '') {
                      // Convert key to camelCase for the API
                      const camelKey = key.replace(/\s+([a-z])/g, (_, letter) => letter.toUpperCase());
                      extracted[camelKey] = String(value);
                    }
                  });
                  
                  return extracted;
                };
                
                // Extract all available data
                const extractedData = extractData(supplier);
                
                // Create flexible payload - only include fields that have actual data
                const payload: Record<string, unknown> = {
                  userId: user.id,
                };

                // Only add fields that actually have data
                if (extractedData.ID || extractedData.id || extractedData.supplierId) {
                  payload.supplierId = extractedData.ID || extractedData.id || extractedData.supplierId;
                } else {
                  // Generate ID only if none provided
                  payload.supplierId = generateUniqueSupplierId();
                }

                // Only add fields that have actual values (no auto-filling)
                if (extractedData.name || extractedData['Supplier Name'] || extractedData.supplier || extractedData['Name']) {
                  payload.name = extractedData.name || extractedData['Supplier Name'] || extractedData.supplier || extractedData['Name'];
                }

                if (extractedData.contact || extractedData.Contact || extractedData['Contact Person']) {
                  payload.contact = extractedData.contact || extractedData.Contact || extractedData['Contact Person'];
                }

                if (extractedData.email || extractedData.Email) {
                  payload.email = extractedData.email || extractedData.Email;
                }

                if (extractedData.phone || extractedData.Phone || extractedData.telephone) {
                  payload.phone = extractedData.phone || extractedData.Phone || extractedData.telephone;
                }

                if (extractedData.businessType || extractedData.type || extractedData['Business Type']) {
                  payload.businessType = extractedData.businessType || extractedData.type || extractedData['Business Type'];
                }

                if (extractedData.address || extractedData.Address || extractedData.location) {
                  payload.address = extractedData.address || extractedData.Address || extractedData.location;
                }

                if (extractedData.status || extractedData.Status) {
                  payload.status = extractedData.status || extractedData.Status;
                }

                if (extractedData.createdAt || extractedData.created || extractedData.date) {
                  payload.createdAt = extractedData.createdAt || extractedData.created || extractedData.date;
                }

                // Store any additional fields in logistics
                const additionalFields: Record<string, string> = {};
                Object.keys(extractedData).forEach(key => {
                  if (!['ID', 'id', 'supplierId', 'name', 'Supplier Name', 'supplier', 'Name', 'contact', 'Contact', 'Contact Person', 'email', 'phone', 'Phone', 'telephone', 
                        'businessType', 'type', 'Business Type', 'address', 'Address', 'location', 'status', 'Status', 'createdAt', 'created', 'date',
                        'preferredDays', 'Preferred Delivery Days', 'lastDelivery', 'Last Delivery', 'deliverySuccess', 'Delivery Success'].includes(key)) {
                    additionalFields[key] = extractedData[key];
                  }
                });

                if (Object.keys(additionalFields).length > 0) {
                  payload.logistics = JSON.stringify(additionalFields);
                }

                if (extractedData.notes || extractedData.Notes || extractedData.comments || extractedData.Comments || 
                    extractedData.tags || extractedData.Tags) {
                  payload.notes = JSON.stringify([
                    extractedData.notes || extractedData.Notes || extractedData.comments || extractedData.Comments || extractedData.tags || extractedData.Tags
                  ]);
                }

                if (extractedData.supplies || extractedData.Supplies || extractedData.products || extractedData.Products) {
                  payload.supplies = JSON.stringify(extractedData.supplies || extractedData.Supplies || extractedData.products || extractedData.Products);
                }
                
                const CREATE_SUPPLIER_MUTATION = `
                  mutation CreateSupplier(
                    $userId: Int!
                    $supplierId: String
                    $name: String
                    $contact: String
                    $email: String
                    $phone: String
                    $businessType: String
                    $address: String
                    $status: String
                    $logistics: String
                    $notes: String
                    $supplies: String
                  ) {
                    createSupplier(
                      userId: $userId
                      supplierId: $supplierId
                      name: $name
                      contact: $contact
                      email: $email
                      phone: $phone
                      businessType: $businessType
                      address: $address
                      status: $status
                      logistics: $logistics
                      notes: $notes
                      supplies: $supplies
                    ) {
                      id
                      supplierId
                    }
                  }
                `;
                
                await fetchGraphQL(CREATE_SUPPLIER_MUTATION, {
                  userId: user?.id,
                  supplierId: payload.supplierId,
                  name: payload.name,
                  contact: payload.contact,
                  email: payload.email,
                  phone: payload.phone,
                  businessType: payload.businessType,
                  address: payload.address,
                  status: payload.status,
                  logistics: payload.logistics,
                  notes: payload.notes,
                  supplies: payload.supplies,
                });
                
                successCount++;
              } catch (error) {
                errorCount++;
              }
            }
            
            // Show import results
            if (successCount > 0) {
              setOverlayMessage(tSuppliers('importSuccess', { count: successCount }));
              setShowOverlay(true);
              setIsSlidingIn(true);
              
              setTimeout(() => {
                // Start slide-out animation
                setIsSlidingOut(true);
                setShowOverlay(false);
                
                // Remove overlay completely after animation
                setTimeout(() => {
                  setIsSlidingOut(false);
                }, 500);
              }, 2000);
            }
            
            fetchSuppliers();
          } catch (error) {
            setLoading(false);
          }
        }}
        type="Suppliers"
      />
      
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
                {loading || isSlidingIn ? tShared('pleaseWait') : tSuppliers('loaded', { count: suppliers.length })}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
  
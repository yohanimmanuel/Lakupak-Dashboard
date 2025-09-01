'use client';
import React, { useState, useEffect, useRef } from 'react';
import Statcards from '@/components/clientmanagement/Statcards';
import BuyerTable from "@/components/clientmanagement/BuyerTable";
import BuyerModal from '@/components/clientmanagement/BuyerModal';
import { Plus, Upload, Download, RefreshCw, Check, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';
import ImportData from '@/components/clientmanagement/ImportData';
import { useUserStore } from '@/store/userStore';
import { Buyer, BuyerTableRow, BuyerFormData, OrderDetail } from '@/types/client';
import { formatDate, formatNumber } from '@/utils/dateUtils';

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
      totalSpend += parseInt((o.totalSpend || '').toString().replace(/[^ - \d]/g, '')) || 0;
    });
    outstanding = orderDetails.reduce((sum: number, o: OrderDetail) => sum + (parseInt((o.outstanding || '').toString().replace(/[^ - \d]/g, '')) || 0), 0);
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
          createdAt: formatDate(buyer.createdAt),
      lastUpdated: formatDate(buyer.updatedAt),
    userId: buyer.userId || 0,
  };
}

function generateBuyerId() {
  return 'LKB-' + Math.floor(10000000 + Math.random() * 90000000).toString();
}

function generateSecureBuyerId() {
  return 'LKB-' + Math.floor(10000000 + Math.random() * 90000000).toString();
}

export default function BuyersPage() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [loading, setLoading] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [overlayMessage, setOverlayMessage] = useState('');
  const [isSlidingIn, setIsSlidingIn] = useState(false);
  const [isSlidingOut, setIsSlidingOut] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState('');
  const [updateError, setUpdateError] = useState('');
  const overlayTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const user = useUserStore(state => state.user);

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

  const fetchBuyers = async () => {
    if (!user?.id) return;
    setLoading(true);
    
    // Clear any existing timeouts
    if (overlayTimeoutRef.current) {
      clearTimeout(overlayTimeoutRef.current);
    }
    
    // For refresh button, start slide-in animation
    if (buyers.length > 0) {
      setIsSlidingOut(false);
      setIsSlidingIn(true);
      setOverlayMessage('Refreshing buyer data');
    }
    
    try {
      const res = await fetch(`/api/buyers?userId=${user.id}`);
      if (!res.ok) {
        // Failed to fetch buyers
        setBuyers([]);
        setLoading(false);
        setOverlayMessage('Failed to load buyers');
        return;
      }
      const data = await res.json();
      // Handle both old format (array) and new format (object with pagination)
      const buyersData = Array.isArray(data) ? data : (data.buyers || []);
      
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
      setOverlayMessage(`Showing buyer data (${buyersWithAnalytics.length})`);
    } catch (error) {
      // Error fetching buyers
      setBuyers([]);
      setOverlayMessage('Error loading buyers');
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
  };

  useEffect(() => {
    // Start slide-in animation immediately for initial page load
    setIsSlidingIn(true);
    setOverlayMessage('Loading buyer data...');
    
    fetchBuyers();
    
    // Cleanup timeout on unmount
    return () => {
      if (overlayTimeoutRef.current) {
        clearTimeout(overlayTimeoutRef.current);
      }
    };
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


  return (
    <div className="p-4 w-full min-h-screen flex flex-col items-right bg-gradient-to-b from-gray-50 to-white">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-2">
        <div>
          <h2 className="text-2xl font-bold text-black mb-2">Buyers List</h2>
          <p className="text-sm text-gray-500 mb-4">Manage your buyers and their information.</p>

        </div>
        <div className="flex gap-2 items-center">
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-gray-200 text-black font-medium hover:bg-gray-100 transition text-sm"
            onClick={fetchBuyers}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-gray-200 text-black font-medium hover:bg-gray-100 transition text-sm"
            onClick={() => setShowImportModal(true)}
          >
            <Upload className="w-4 h-4" /> Import Data
          </button>
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-gray-200 text-black font-medium hover:bg-gray-100 transition text-sm"
            onClick={() => document.getElementById('buyer-table-export-xlsx-trigger')?.click()}
          >
            <Download className="w-4 h-4" /> Export Data
          </button>
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0a61d7] text-white font-semibold hover:bg-[#084ba6] transition text-sm"
            onClick={() => setShowAddModal(true)}
          >
            <Plus className="w-4 h-4" /> Add Buyer
          </button>
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
            {loading ? (
              <div className="w-5 h-5 border-2 border-[#0a61d7] border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                <Check className="w-4 h-4 text-white" />
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-gray-900">{overlayMessage}</p>
              <p className="text-xs text-gray-500">
                {loading ? 'Please wait...' : `${buyers.length} buyer${buyers.length !== 1 ? 's' : ''} loaded`}
              </p>
            </div>
          </div>
        </div>
      )}
      
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-[#0a61d7] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">Loading buyers...</p>
          </div>
        </div>
      ) : (
        <>
          <Statcards type="buyer" data={buyers} />
          <BuyerTable buyers={buyers} setBuyers={setBuyers} onExportXLSX={downloadXLSX} profileToTableRow={profileToTableRow} onRefresh={fetchBuyers} />
        </>
      )}
      <BuyerModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={async (data) => {
          setShowAddModal(false);
          await fetchBuyers();
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
            
            for (const buyer of data) {
              try {
                
                // Extract all available data from the buyer object dynamically
                const extractData = (obj: Record<string, unknown>): Record<string, string> => {
                  const extracted: Record<string, string> = {};
                  
                  // Get all keys from the buyer data
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
                const extractedData = extractData(buyer);
                
                // Create flexible payload - only include fields that have actual data
                const payload: Record<string, unknown> = {
                  userId: user.id,
                };

                // Only add fields that actually have data
                if (extractedData.ID || extractedData.id || extractedData.buyerId) {
                  payload.buyerId = extractedData.ID || extractedData.id || extractedData.buyerId;
                } else {
                  // Generate ID only if none provided
                  payload.buyerId = generateBuyerId();
                }

                // Only add fields that have actual values (no auto-filling)
                if (extractedData.storeName || extractedData.store || extractedData.name || extractedData['Store Name']) {
                  payload.storeName = extractedData.storeName || extractedData.store || extractedData.name || extractedData['Store Name'];
                }

                if (extractedData.owner || extractedData.contact || extractedData['Owner']) {
                  payload.owner = extractedData.owner || extractedData.contact || extractedData['Owner'];
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
                  if (!['ID', 'id', 'buyerId', 'storeName', 'store', 'name', 'owner', 'contact', 'email', 'phone', 'telephone', 
                        'businessType', 'type', 'address', 'location', 'status', 'createdAt', 'created', 'date',
                        'preferredDays', 'deliveryDays', 'lastShipment', 'lastDelivery', 'shipmentSuccess', 'successRate'].includes(key)) {
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

                if (extractedData.orderDetails || extractedData.orders || extractedData['Order Details']) {
                  payload.orderDetails = JSON.stringify(extractedData.orderDetails || extractedData.orders || extractedData['Order Details']);
                }
                
                const response = await fetch('/api/buyers', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload),
                });
                
                if (!response.ok) {
                  const errorText = await response.text();
                  throw new Error(`API Error: ${response.status} - ${errorText}`);
                }
                
                successCount++;
              } catch (error) {
                errorCount++;
              }
            }
            
            // Show success/error feedback
            if (successCount > 0) {
              setUpdateSuccess(`Successfully imported ${successCount} buyer${successCount !== 1 ? 's' : ''}`);
            }
            if (errorCount > 0) {
              setUpdateError(`Failed to import ${errorCount} buyer${errorCount !== 1 ? 's' : ''}.`);
            }
            
            // Refresh data
            await fetchBuyers();
            
          } catch (error) {
            setUpdateError('Failed to process import data');
          } finally {
            setLoading(false);
          }
        }}
        type="Buyers"
      />
    </div>
  );
}
  
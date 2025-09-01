'use client';
import React, { useState, useEffect, useRef, useCallback } from "react";
import ProductCards from "@/components/productscatalogs/ProductCards";
import ProductTable from "@/components/productscatalogs/ProductTable";
import ProductImport from "@/components/productscatalogs/ProductImport";
import { Upload, Download, Check, RefreshCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useUserStore } from "@/store/userStore";
import * as XLSX from 'xlsx';
import { Product, ProductTableRow } from "@/types/product";
import { formatDate } from "@/utils/dateUtils";
import { generateUniqueProductId } from "@/utils/product-security";

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

export default function ProductsPage() {
  const router = useRouter();
  const user = useUserStore(state => state.user);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  
  // Enhanced state management for overlay animations
  const [showOverlay, setShowOverlay] = useState(false);
  const [overlayMessage, setOverlayMessage] = useState('');
  const [isSlidingIn, setIsSlidingIn] = useState(false);
  const [isSlidingOut, setIsSlidingOut] = useState(false);
  const overlayTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch products from API
  const fetchProducts = useCallback(async () => {
    if (!user?.id) return;
    
    setLoading(true);
    
    // Clear any existing timeouts
    if (overlayTimeoutRef.current) {
      clearTimeout(overlayTimeoutRef.current);
    }
    
    // For refresh button, start slide-in animation
    if (products.length > 0) {
      setIsSlidingOut(false);
      setIsSlidingIn(true);
      setOverlayMessage('Refreshing product data');
    }
    
    try {
      const response = await fetch(`/api/products?userId=${user.id}`);
      if (response.ok) {
        const data = await response.json();
        // Handle both old format (array) and new format (with pagination)
        const productsData = data.products || data;
        setProducts(productsData);
        setOverlayMessage(`Showing product data (${productsData.length} products loaded)`);
      } else {
        setProducts([]);
        setOverlayMessage('Failed to load products');
        return;
      }
    } catch (error) {
      setProducts([]);
      setOverlayMessage('Error loading products');
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
  }, [user?.id, products.length]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    // Start slide-in animation immediately for initial page load
    setIsSlidingIn(true);
    setOverlayMessage('Loading product data...');
    
    fetchProducts();
    
    // Cleanup timeout on unmount
    return () => {
      if (overlayTimeoutRef.current) {
        clearTimeout(overlayTimeoutRef.current);
      }
    };
  }, [user?.id]);

  // Convert product data to table row format
  const profileToTableRow = (product: Product): ProductTableRow => ({
    id: product.id || 0,
    productId: product.productId,
    sku: product.sku,
    name: product.name,
    category: product.category,
    brand: product.brand,
    supplier: product.supplier,
    stockQuantity: product.stockQuantity,
    lowStockThreshold: product.lowStockThreshold || 30,
    purchasePrice: product.purchasePrice,
    sellingPrice: product.sellingPrice,
    
    status: product.status,
    createdAt: product.createdAt ? formatDate(product.createdAt) : 'N/A',
    lastUpdated: product.updatedAt ? formatDate(product.updatedAt) : 'N/A',
    userId: product.userId || 0
  });

  // Use the enhanced generateUniqueProductId from security utils
  const generateLKPProductId = () => generateUniqueProductId();

  const handleImport = async (data: any[]) => {
    if (!user?.id) return;
    
    try {
      // Process imported data and save to database
      for (const product of data) {
        // Always generate new LKP Product ID for imported products (Laku-Laku standard)
        // Calculate stock status dynamically
        const stockQuantity = parseInt(product['Stock Quantity']) || 0;
        const lowStockThreshold = parseInt(product['Low Stock Threshold']) || 30;
        let stockStatus: 'In Stock' | 'Low Stock' | 'Out of Stock';
        
        if (stockQuantity === 0) {
          stockStatus = 'Out of Stock';
        } else if (lowStockThreshold > 0 && stockQuantity <= lowStockThreshold) {
          stockStatus = 'Low Stock';
        } else {
          stockStatus = 'In Stock';
        }

        const payload = {
          productId: generateLKPProductId(),
          sku: product['SKU'] || '',
          name: product['Product Name'] || '',
          description: product['Description'] || '',
          category: product['Category'] || '',
          brand: product['Brand'] || '',
          supplier: product['Supplier'] || '',
          stockQuantity: stockQuantity,
          lowStockThreshold: lowStockThreshold,
          stockStatus: stockStatus,
          purchasePrice: String(product['Purchase Price'] || ''),
          sellingPrice: String(product['Selling Price'] || ''),
          status: 'Draft', // Always overwrite status to Draft for imported products
          catalogType: product['Catalog Type'] || 'Internal',
          catalogName: product['Catalog Name'] || '',
          discount: parseFloat(product['Discount']) || 0,
          discountType: product['Discount Type'] || '',
          images: [], // Images are not imported via Excel
          userId: user.id
        };
        
        // Always create new product with new LKP ID
        const response = await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        
        if (!response.ok) {
          // Failed to save product
        }
      }
      
      // Refresh products list
      await fetchProducts();
      
      // Close modal
      setIsImportModalOpen(false);
      
      // Show success overlay
      setOverlayMessage(`Successfully imported ${data.length} products`);
      setIsSlidingIn(true);
      setShowOverlay(true);
      
      // Auto-hide overlay after 2.5 seconds
      if (overlayTimeoutRef.current) {
        clearTimeout(overlayTimeoutRef.current);
      }
      overlayTimeoutRef.current = setTimeout(() => {
        setIsSlidingOut(true);
        setShowOverlay(false);
        
        // Remove overlay completely after animation
        setTimeout(() => {
          setIsSlidingOut(false);
        }, 500);
      }, 2500);
       
    } catch (error) {
      // Show error overlay
      setOverlayMessage('Failed to import products');
      setIsSlidingIn(true);
      setShowOverlay(true);
      
      // Auto-hide overlay after 2.5 seconds
      if (overlayTimeoutRef.current) {
        clearTimeout(overlayTimeoutRef.current);
      }
      overlayTimeoutRef.current = setTimeout(() => {
        setIsSlidingOut(true);
        setShowOverlay(false);
        
        // Remove overlay completely after animation
        setTimeout(() => {
          setIsSlidingOut(false);
        }, 500);
      }, 2500);
    }
  };

  const handleExport = () => {
    // Export products data to XLSX
    const headers = ['Product ID', 'SKU', 'Product Name', 'Category', 'Brand', 'Supplier', 'Stock Quantity', 'Purchase Price', 'Selling Price', 'Status', 'Last Updated'];
    const rows = products.map(product => [
      product.productId || `LKP-${String(product.id).padStart(8, '0')}`, // Fallback to LKP format if no productId
      product.sku,
      product.name,
      product.category,
      product.brand,
      product.supplier,
      product.stockQuantity,
      product.purchasePrice,
      product.sellingPrice,
      product.status,
      product.updatedAt ? formatDate(product.updatedAt) : 'N/A'
    ]);
    
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Products');
    
    // Generate filename with current date
    const currentDate = new Date().toISOString().split('T')[0];
    const filename = `products_export_${currentDate}.xlsx`;
    
    downloadXLSX(wb, filename);
  };

  if (loading) {
    return (
      <div className="w-full mx-auto p-4 bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[#0a61d7] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading products...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Products</h1>
          <p className="text-sm text-gray-500 mb-4">Manage your product catalog and inventory</p>
        </div>
        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          {/* Refresh Button */}
          <button
            onClick={fetchProducts}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-[#e6e6e6] text-black rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            <RefreshCcw className="w-4 h-4" />
            Refresh
          </button>

          {/* Import Button */}
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-[#e6e6e6] text-black rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            <Upload className="w-4 h-4" />
            Import Data
          </button>

          {/* Export Button */}
          <button
            onClick={() => handleExport()}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-[#e6e6e6] text-black rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            Export Data
          </button>

          {/* Add Product Button */}
          <button
            onClick={() => router.push('/products/add')}
            className="flex items-center gap-2 px-6 py-2 bg-[#0a61d7] font-semibold text-white rounded-lg hover:bg-[#0851b8] transition-colors text-sm font-medium"
          >
            + Add Product
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <ProductCards products={products} />

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
                {loading ? 'Please wait...' : `${products.length} product${products.length !== 1 ? 's' : ''} loaded`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons and Table */}
      <div className="mt-6">
        <ProductImport 
          open={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          onImport={handleImport}
        />
        <ProductTable 
          products={products}
          setProducts={setProducts}
          profileToTableRow={profileToTableRow}
          onExportXLSX={downloadXLSX}
        />
      </div>
    </div>
  );
}

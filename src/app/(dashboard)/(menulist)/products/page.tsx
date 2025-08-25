'use client';
import React, { useState, useEffect } from "react";
import ProductCards from "@/components/productscatalogs/ProductCards";
import ProductTable from "@/components/productscatalogs/ProductTable";
import ProductImport from "@/components/productscatalogs/ProductImport";
import { Upload, Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { useUserStore } from "@/store/userStore";
import * as XLSX from 'xlsx';

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
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // Fetch products from API
  const fetchProducts = async () => {
    if (!user?.id) return;
    
    try {
      setLoading(true);
      const response = await fetch(`/api/products?userId=${user.id}`);
      if (response.ok) {
        const data = await response.json();
        setProducts(data);
      } else {
        console.error('Failed to fetch products');
        setProducts([]);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [user?.id]);

  // Convert product data to table row format
  const profileToTableRow = (product: any) => ({
    id: product.id,
    productId: product.productId,
    sku: product.sku,
    name: product.name,
    category: product.category,
    brand: product.brand,
    supplier: product.supplier,
    stockQuantity: product.stockQuantity,
    purchasePrice: product.purchasePrice,
    sellingPrice: product.sellingPrice,
    status: product.status,
    createdAt: product.createdAt ? new Date(product.createdAt).toLocaleDateString() : '',
    lastUpdated: product.updatedAt ? new Date(product.updatedAt).toLocaleDateString() : '',
    userId: product.userId
  });

  // Generate LKP product ID format: LKP-8 random numbers
  const generateLKPProductId = () => {
    const randomNumbers = Math.floor(Math.random() * 90000000) + 10000000; // 8 digits
    return `LKP-${randomNumbers}`;
  };

  const handleImport = async (data: any[]) => {
    if (!user?.id) return;
    
    console.log('Imported products:', data);
    
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
        } else if (stockQuantity <= lowStockThreshold) {
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
          purchasePrice: parseFloat(product['Purchase Price']) || 0,
          sellingPrice: parseFloat(product['Selling Price']) || 0,
          status: 'Draft', // Always overwrite status to Draft for imported products
          catalogType: product['Catalog Type'] || 'Internal',
          catalogName: product['Catalog Name'] || '',
          sizes: product['Sizes'] ? product['Sizes'].split(',').map((s: string) => s.trim()) : [],
          gender: product['Gender'] || 'Unisex',
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
          console.error('Failed to save product:', payload.name);
        }
      }
      
      // Refresh products list
      await fetchProducts();
      
      // Close modal
      setIsImportModalOpen(false);
      
             // Import completed successfully
       
     } catch (error) {
       console.error('Error importing products:', error);
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
      product.updatedAt ? new Date(product.updatedAt).toLocaleDateString() : ''
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
    <div className="w-full mx-auto p-4 bg-gray-50 min-h-screen">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Products</h1>
          <p className="text-sm text-gray-500 mb-4">Manage your product catalog and inventory</p>
        </div>
        {/* Action Buttons */}
        <div className="flex items-center gap-3">
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
            onClick={handleExport}
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

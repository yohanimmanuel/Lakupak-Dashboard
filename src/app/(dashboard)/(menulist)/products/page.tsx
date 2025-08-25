'use client';
import React, { useState } from "react";
import ProductCards from "@/components/productscatalogs/ProductCards";
import ProductTable from "@/components/productscatalogs/ProductTable";
import ProductImport from "@/components/productscatalogs/ProductImport";
import { Upload, Download } from "lucide-react";
import { useRouter } from "next/navigation";
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
  // Mock products data for demonstration
  const [products] = useState([
    {
      id: "PRD001",
      sku: "SKU001",
      name: "Indomie Goreng",
      category: "Foods",
      brand: "Indofood",
      supplier: "PT Indofood Sukses Makmur",
      stockQuantity: 150,
      purchasePrice: "Rp 2,500",
      sellingPrice: "Rp 3,500",
      status: "Published",
      lastUpdated: "2024-01-15"
    },
    {
      id: "PRD002",
      sku: "SKU002",
      name: "Aqua Mineral Water",
      category: "Beverages",
      brand: "Aqua",
      supplier: "PT Aqua Golden Mississippi",
      stockQuantity: 45,
      purchasePrice: "Rp 1,200",
      sellingPrice: "Rp 1,800",
      status: "Draft",
      lastUpdated: "2024-01-14"
    },
    {
      id: "PRD003",
      sku: "SKU003",
      name: "Samsung LED TV 32\"",
      category: "Electronics",
      brand: "Samsung",
      supplier: "PT Samsung Electronics Indonesia",
      stockQuantity: 0,
      purchasePrice: "Rp 2,500,000",
      sellingPrice: "Rp 3,200,000",
      status: "Draft",
      lastUpdated: "2024-01-13"
    },
    {
      id: "PRD004",
      sku: "SKU004",
      name: "Honda Generator 2000W",
      category: "Machineries",
      brand: "Honda",
      supplier: "PT Honda Power Products Indonesia",
      stockQuantity: 8,
      purchasePrice: "Rp 8,500,000",
      sellingPrice: "Rp 12,000,000",
      status: "Draft",
      lastUpdated: "2024-01-12"
    }
  ]);

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const handleImport = async (data: any[]) => {
    console.log('Imported products:', data);
    // In real implementation, this would:
    // 1. Parse the imported data
    // 2. Validate the data
    // 3. Save to database via API
    // 4. Update the products list
    // 5. Show success/error messages
    
    // Example of how the data would be processed:
    for (const product of data) {
      const payload = {
        id: product['Product ID'],
        sku: product['SKU'] || '',
        name: product['Product Name'] || '',
        description: product['Description'] || '',
        category: product['Category'] || '',
        brand: product['Brand'] || '',
        supplier: product['Supplier'] || '',
        stockQuantity: parseInt(product['Stock Quantity']) || 0,
        lowStockThreshold: parseInt(product['Low Stock Threshold']) || 30,
        stockStatus: product['Stock Status'] || 'In Stock',
        purchasePrice: parseFloat(product['Purchase Price']) || 0,
        sellingPrice: parseFloat(product['Selling Price']) || 0,
        status: product['Status'] || 'Draft',
        catalogType: product['Catalog Type'] || 'Internal',
        catalogName: product['Catalog Name'] || '',
        sizes: product['Sizes'] ? product['Sizes'].split(',').map((s: string) => s.trim()) : [],
        gender: product['Gender'] || 'Unisex',
        discount: parseFloat(product['Discount']) || 0,
        discountType: product['Discount Type'] || '',
        images: [], // Images are not imported via Excel
      };
      
      // In real implementation, you would make an API call here:
      // await fetch('/api/products', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(payload),
      // });
      
      console.log('Processing product:', payload);
    }
    
    // Close modal and refresh data
    setIsImportModalOpen(false);
    // fetchProducts(); // In real implementation, refresh the products list
  };

  const handleExport = () => {
    // Export products data to XLSX
    const headers = ['Product ID', 'SKU', 'Product Name', 'Category', 'Brand', 'Supplier', 'Stock Quantity', 'Purchase Price', 'Selling Price', 'Status', 'Last Updated'];
    const rows = products.map(product => [
      product.id,
      product.sku,
      product.name,
      product.category,
      product.brand,
      product.supplier,
      product.stockQuantity,
      product.purchasePrice,
      product.sellingPrice,
      product.status,
      product.lastUpdated
    ]);
    
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Products');
    
    // Generate filename with current date
    const currentDate = new Date().toISOString().split('T')[0];
    const filename = `products_export_${currentDate}.xlsx`;
    
    downloadXLSX(wb, filename);
  };

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
        <ProductTable />
      </div>
    </div>
  );
}

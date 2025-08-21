'use client';
import React, { useState } from "react";
import ProductCards from "@/components/productscatalogs/ProductCards";
import ProductTable from "@/components/productscatalogs/ProductTable";
import ProductImport from "@/components/productscatalogs/ProductImport";
import { Upload, Download } from "lucide-react";
import { useRouter } from "next/navigation";

export default function ProductsPage() {
  const router = useRouter();
  // Mock products data for demonstration
  const [products] = useState([
    {
      id: "PRD001",
      status: "Published",
      stockQuantity: 150
    },
    {
      id: "PRD002", 
      status: "Draft",
      stockQuantity: 45
    },
    {
      id: "PRD003",
      status: "Inactive", 
      stockQuantity: 0
    },
    {
      id: "PRD004",
      status: "Draft",
      stockQuantity: 8
    }
  ]);

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const handleImport = (data: any[]) => {
    console.log('Imported products:', data);
    // In real implementation, this would update the product list
  };

  const handleExport = () => {
    console.log('Exporting products...');
    // In real implementation, this would export the product data
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
          onImport={handleImport} 
          onExport={handleExport} 
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
        />
        <ProductTable />
      </div>
    </div>
  );
}

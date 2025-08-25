'use client';
import React, { useState, useRef, useLayoutEffect, useEffect } from "react";
import { useRouter } from 'next/navigation';
import { Search, Eye, Filter, Calendar, ChevronDown, ChevronLeft, ChevronRight, Trash, Edit, MoreHorizontal, Grid3X3, List, EyeClosed, Globe, Zap, EyeOff } from "lucide-react";
import { format } from 'date-fns';
import { useUserStore } from '@/store/userStore';
import ProductMarketplacePubs from '../productscatalogs/ProductMarketplacePubs';
import * as XLSX from 'xlsx';

const statusTabs = [
  { label: "All" },
  { label: "Draft" },
  { label: "Published" },
  { label: "Active" },
  { label: "Inactive" },
];

const stockFilters = [
  { label: "All Stock", value: "all" },
  { label: "High Stock", value: "high" },
  { label: "Low Stock", value: "low" },
  { label: "Out of Stock", value: "out" },
];

// Dynamic category filters based on existing products
const getCategoryFilters = (products: any[]) => {
  const categories = new Set(products.map(product => product.category).filter(Boolean));
  return ["All Categories", ...Array.from(categories)];
};

export default function ProductTable({ products = [], setProducts, onSelectProduct, onExportXLSX, profileToTableRow }: { 
  products?: any[]; 
  setProducts?: (fn: (prev: any[]) => any[]) => void; 
  onSelectProduct?: (product: any) => void; 
  onExportXLSX?: (wb: any, filename: string) => void; 
  profileToTableRow: (product: any) => any 
}) {
  const user = useUserStore(state => state.user);
  const tableRows = products.map(profileToTableRow);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedTab, setSelectedTab] = useState("All");
  const [selectedStockFilter, setSelectedStockFilter] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("All Categories");
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  
  // Get dynamic category filters based on current products
  const categoryFilters = getCategoryFilters(products);
  const [showStockDropdown, setShowStockDropdown] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [productToDelete, setProductToDelete] = useState<any>(null);
  const [isBulkDelete, setIsBulkDelete] = useState(false);
  
  const router = useRouter();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });
  const rowsPerPage = 8;

  // Filter products based on search, status, category, and stock
  let filteredProducts = tableRows.filter((p: any) => String(p.name).toLowerCase().includes(search.toLowerCase()));
  
  if (selectedTab !== "All") filteredProducts = filteredProducts.filter((p: any) => p.status === selectedTab);
  if (selectedCategory !== "All Categories") filteredProducts = filteredProducts.filter((p: any) => p.category === selectedCategory);
  
  if (selectedStockFilter !== "all") {
    filteredProducts = filteredProducts.filter((p: any) => {
      const stock = p.stockQuantity;
      if (selectedStockFilter === "high") return stock > 50;
      if (selectedStockFilter === "low") return stock <= 50 && stock > 0;
      if (selectedStockFilter === "out") return stock === 0;
      return true;
    });
  }

  const totalRows = filteredProducts.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
  const pagedProducts = filteredProducts.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  const fromRow = totalRows === 0 ? 0 : (page - 1) * rowsPerPage + 1;
  const toRow = Math.min(page * rowsPerPage, totalRows);

  const handleDeleteConfirm = async () => {
    if (!user?.id) return;
    
    if (isBulkDelete) {
      // Bulk delete - delete all selected products
      for (const productId of selectedProducts) {
        const product = pagedProducts.find(p => String(p.id) === productId);
        if (product) {
          const res = await fetch(`/api/products?id=${product.productId}&userId=${user.id}`, { method: 'DELETE' });
          if (res.ok && setProducts) {
            setProducts(prev => prev.filter(p => p.productId !== product.productId));
          }
        }
      }
      setSelectedProducts([]); // Clear selection after deleting
    } else {
      // Single delete - delete one product
      if (!productToDelete) return;
      const res = await fetch(`/api/products?id=${productToDelete.productId}&userId=${user.id}`, { method: 'DELETE' });
      if (res.ok && setProducts) {
        setProducts(prev => prev.filter(p => p.productId !== productToDelete.productId));
      }
      setProductToDelete(null);
    }
    
    setShowDeleteModal(false);
    setIsBulkDelete(false);
  };

  const handleDeleteCancel = () => {
    setShowDeleteModal(false);
    setProductToDelete(null);
    setIsBulkDelete(false);
  };

  const handleProductSelect = (productId: string) => {
    setSelectedProducts(prev => 
      prev.includes(productId) 
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const handleRowClick = (productId: string, event: React.MouseEvent) => {
    // Don't trigger row selection if clicking on action buttons or checkbox
    if ((event.target as HTMLElement).closest('button') || (event.target as HTMLElement).closest('th')) {
      return;
    }
    handleProductSelect(productId);
  };

  const handleSelectAll = () => {
    if (selectedProducts.length === pagedProducts.length) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(pagedProducts.map(product => String(product.id)));
    }
  };

  const handleBulkRemove = () => {
    setIsBulkDelete(true);
    setShowDeleteModal(true);
  };

  useLayoutEffect(() => {
    const idx = statusTabs.findIndex(tab => tab.label === selectedTab);
    const node = tabRefs.current[idx];
    if (node) {
      setIndicatorStyle({
        left: node.offsetLeft,
        width: node.offsetWidth,
      });
    }
  }, [selectedTab]);

  const handleView = (product: any) => {
    router.push(`/products/catalog/${product.productId}`);
  };

  const handleEdit = (product: any) => {
    router.push(`/products/edit/${product.productId}`);
  };

  const handleDelete = async (product: any) => {
    setProductToDelete(product);
    setShowDeleteModal(true);
  };

  const tabIdx = statusTabs.findIndex(tab => tab.label === selectedTab);

  // Status color helper
  const statusBadge = (status: string) => {
    if (status === "Published" || status === "Active") return "bg-green-100 text-green-500";
    if (status === "Draft" || status === "Inactive") return "bg-gray-100 text-gray-500";
    return "bg-gray-100 text-gray-500";
  };

  // Stock status helper
  const stockStatusBadge = (stock: number, threshold: number = 30) => {
    if (stock === 0) return "bg-red-100 text-red-500";
    if (stock <= threshold) return "bg-yellow-100 text-yellow-500";
    return "bg-green-100 text-green-500";
  };

  // Export XLSX function
  const handleExportXLSX = () => {
    const headers = ['Product ID', 'SKU', 'Name', 'Category', 'Brand', 'Supplier', 'Stock Quantity', 'Purchase Price', 'Selling Price', 'Status', 'Created At'];
    const rows = filteredProducts.map((p: any) => [
      p.productId || `LKP-${String(p.id).padStart(8, '0')}`, // Fallback to LKP format if no productId
      p.sku,
      p.name,
      p.category,
      p.brand,
      p.supplier,
      p.stockQuantity,
      p.purchasePrice,
      p.sellingPrice,
      p.status,
      p.createdAt
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Products');
    if (onExportXLSX) onExportXLSX(wb, 'products.xlsx');
  };

  return (
    <div className="w-full mx-auto bg-white rounded-lg shadow-sm border border-gray-200 p-4 mt-3">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
        {/* Status Tabs - Segmented Control */}
        <div className="relative w-full md:w-auto flex items-center">
          <div className="flex w-full md:w-auto bg-gray-100 rounded-lg overflow-hidden relative">
            {/* Sliding Indicator */}
            <div
              className="absolute top-0 h-full transition-all duration-300"
              style={{
                left: indicatorStyle.left,
                width: indicatorStyle.width,
                background: '#0a61d7',
                borderRadius: '0.75rem',
                zIndex: 1,
              }}
            />
            {statusTabs.map((tab, idx) => (
              <button
                key={tab.label}
                ref={el => { tabRefs.current[idx] = el; }}
                onClick={() => {
                  setSelectedTab(tab.label);
                  setSelectedProducts([]); // Reset selection when switching tabs
                }}
                className={`relative z-10 flex-1 px-6 py-2 font-medium text-[14px] transition-colors duration-200 focus:outline-none ${
                  selectedTab === tab.label
                    ? 'text-white'
                    : 'text-gray-700 hover:text-[#0a61d7]'
                } ${
                  idx === 0 ? 'rounded-l-lg' : idx === statusTabs.length - 1 ? 'rounded-r-lg' : ''
                }`}
                style={{
                  background: 'transparent',
                  boxShadow: 'none',
                  minWidth: 0,
                  flex: 'unset',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

                 {/* Search and Filters */}
         <div className="flex gap-2 w-full md:w-auto items-center justify-end">
          <div className="relative w-full md:w-64">
            <input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-[#e6e6e6] text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#0a61d7] bg-white"
            />
            <Search className="absolute left-3 top-2 text-gray-400 w-5 h-5" />
          </div>

          {/* Stock Filter Dropdown */}
          <div className="relative">
            <button
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-100 text-sm"
              onClick={() => {
                setShowStockDropdown(v => !v);
                setShowCategoryDropdown(false);
                setShowFilterDropdown(false);
              }}
            >
              <Filter className="w-4 h-4" />
              {stockFilters.find(f => f.value === selectedStockFilter)?.label}
              <ChevronDown className="w-4 h-4 ml-1 text-gray-500" />
            </button>
            {showStockDropdown && (
              <div className="absolute right-0 mt-2 w-40 bg-white border border-gray-200 rounded-lg shadow z-20">
                {stockFilters.map((filter) => (
                  <button
                    key={filter.value}
                    onClick={() => {
                      setSelectedStockFilter(filter.value);
                      setShowStockDropdown(false);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 first:rounded-t-lg last:rounded-b-lg"
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Category Filter Dropdown */}
          <div className="relative">
            <button
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-100 text-sm"
              onClick={() => {
                setShowCategoryDropdown(v => !v);
                setShowStockDropdown(false);
                setShowFilterDropdown(false);
              }}
            >
              <Filter className="w-4 h-4" />
              {selectedCategory}
              <ChevronDown className="w-4 h-4 ml-1 text-gray-500" />
            </button>
            {showCategoryDropdown && (
              <div className="absolute right-0 mt-2 w-40 bg-white border border-gray-200 rounded-lg shadow z-20">
                {categoryFilters.map((category) => (
                  <button
                    key={category}
                    onClick={() => {
                      setSelectedCategory(category);
                      setShowCategoryDropdown(false);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 first:rounded-t-lg last:rounded-b-lg"
                  >
                    {category}
                  </button>
                ))}
              </div>
            )}
          </div>

           {/* View Toggle - Desktop Only */}
           <div className="hidden md:flex items-center gap-1 bg-gray-100 rounded-lg p-1">
             <button
               onClick={() => setViewMode('list')}
               className={`p-2 rounded-md transition-colors ${
                 viewMode === 'list' 
                   ? 'bg-white text-[#0a61d7] shadow-sm' 
                   : 'text-gray-500 hover:text-gray-700'
               }`}
               title="List View"
             >
               <List className="w-4 h-4" />
             </button>
             <button
               onClick={() => setViewMode('grid')}
               className={`p-2 rounded-md transition-colors ${
                 viewMode === 'grid' 
                   ? 'bg-white text-[#0a61d7] shadow-sm' 
                   : 'text-gray-500 hover:text-gray-700'
               }`}
               title="Grid View"
             >
               <Grid3X3 className="w-4 h-4" />
             </button>
           </div>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedProducts.length > 0 && (
        <div className="bg-gradient-to-r from-green-500 to-green-400 rounded-lg p-3 md:p-4 mb-2">
          {/* Mobile Layout */}
          <div className="md:hidden space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <div className="text-white flex items-center justify-center text-sm font-semibold">
                    {selectedProducts.length}
                </div>
                <span className="text-sm font-semibold text-white">
                  {selectedProducts.length === 1 ? 'product' : 'products'} selected
                </span>
              </div>
            </div>
                        <div className="text-white text-xs font-semibold leading-relaxed">
              {(() => {
                const buttons = { canPublish: false, canUnpublish: false, canRemove: true };
                if (selectedProducts.length > 0) {
                  const selectedProductData = pagedProducts.filter(product => selectedProducts.includes(String(product.id)));
                  const hasDraft = selectedProductData.some(product => product.status === 'Draft');
                  const hasPublished = selectedProductData.some(product => product.status === 'Published');
                  const hasInactive = selectedProductData.some(product => product.status === 'Inactive');
                  const hasActive = selectedProductData.some(product => product.status === 'Active');

                  buttons.canPublish = hasDraft || hasInactive || hasActive;
                  buttons.canUnpublish = hasPublished;
                  buttons.canRemove = true;
                }
                if (buttons.canPublish && buttons.canUnpublish) {
                  return "Mixed product statuses selected. Only removal is allowed for safety.";
                } else if (buttons.canPublish) {
                  return "Your product will be published in our B2B Marketplace Mobile app. 😉";
                } else if (buttons.canUnpublish) {
                  return "Select products to be unpublished or removed.";
                } else {
                  return "Select products to be removed.";
                }
              })()}
            </div>
            <div className="flex gap-2">
              {(() => {
                const buttons = { canPublish: false, canUnpublish: false, canRemove: true };
                if (selectedProducts.length > 0) {
                  const selectedProductData = pagedProducts.filter(product => selectedProducts.includes(String(product.id)));
                  const hasDraft = selectedProductData.some(product => product.status === 'Draft');
                  const hasPublished = selectedProductData.some(product => product.status === 'Published');
                  const hasInactive = selectedProductData.some(product => product.status === 'Inactive');
                  const hasActive = selectedProductData.some(product => product.status === 'Active');

                  buttons.canPublish = hasDraft || hasInactive || hasActive;
                  buttons.canUnpublish = hasPublished;
                  buttons.canRemove = true;
                }
                const buttonElements = [];
                
                if (buttons.canPublish && !buttons.canUnpublish) {
                  // Only draft/inactive products - show publish and remove
                  buttonElements.push(
                    <button
                      key="publish"
                      onClick={() => {
                        const productToPublish = pagedProducts.find(p => selectedProducts.includes(String(p.id)));
                        if (productToPublish) {
                          onSelectProduct?.(productToPublish);
                        }
                      }}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white font-semibold text-sm rounded-lg hover:bg-emerald-700 transition-colors"
                    >
                      <Zap className="w-4 h-4 text-white" />
                      Publish
                    </button>
                  );
                } else if (buttons.canUnpublish && !buttons.canPublish) {
                  // Only published products - show unpublish and remove
                  buttonElements.push(
                    <button
                      key="unpublish"
                      onClick={() => handleBulkRemove()}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-orange-600 text-white font-semibold text-sm rounded-lg hover:bg-orange-700 transition-colors"
                    >
                      <EyeOff className="w-4 h-4 text-white" />
                      Unpublish
                    </button>
                  );
                }
                
                // Always show remove button
                buttonElements.push(
                  <button
                    key="remove"
                    onClick={() => handleBulkRemove()}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold text-sm rounded-lg hover:bg-red-700 transition-colors"
                  >
                    <Trash className="w-4 h-4 text-white" />
                    Remove
                  </button>
                );
                
                return buttonElements;
              })()}
            </div>
          </div>
          
          {/* Desktop Layout */}
          <div className="hidden md:flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <div className="text-white flex items-center justify-center text-sm font-semibold">
                  {selectedProducts.length}
                </div>
                <span className="text-sm font-semibold text-white">
                  {selectedProducts.length === 1 ? 'product' : 'products'} selected
                </span>
              </div>
            </div>
                        <div className="flex items-center gap-4">
              <span className="text-white text-xs md:text-sm font-semibold">
                {(() => {
                  const buttons = { canPublish: false, canUnpublish: false, canRemove: true };
                  if (selectedProducts.length > 0) {
                    const selectedProductData = pagedProducts.filter(product => selectedProducts.includes(String(product.id)));
                    const hasDraft = selectedProductData.some(product => product.status === 'Draft');
                    const hasPublished = selectedProductData.some(product => product.status === 'Published');
                    const hasInactive = selectedProductData.some(product => product.status === 'Inactive');
                    const hasActive = selectedProductData.some(product => product.status === 'Active');

                    buttons.canPublish = hasDraft || hasInactive || hasActive;
                    buttons.canUnpublish = hasPublished;
                    buttons.canRemove = true;
                  }
                  if (buttons.canPublish && buttons.canUnpublish) {
                    return "Mixed product statuses selected. Only removal is allowed for safety.";
                  } else if (buttons.canPublish) {
                    return "Your product will be published in our B2B Marketplace Mobile app. 😉";
                  } else if (buttons.canUnpublish) {
                    return "Select products to unpublish or remove from the system.";
                  } else {
                    return "Select products to remove from the system.";
                  }
                })()}
              </span>
              <div className="flex gap-2">
                {(() => {
                  const buttons = { canPublish: false, canUnpublish: false, canRemove: true };
                  if (selectedProducts.length > 0) {
                    const selectedProductData = pagedProducts.filter(product => selectedProducts.includes(String(product.id)));
                    const hasDraft = selectedProductData.some(product => product.status === 'Draft');
                    const hasPublished = selectedProductData.some(product => product.status === 'Published');
                    const hasInactive = selectedProductData.some(product => product.status === 'Inactive');
                    const hasActive = selectedProductData.some(product => product.status === 'Active');

                    buttons.canPublish = hasDraft || hasInactive || hasActive;
                    buttons.canUnpublish = hasPublished;
                    buttons.canRemove = true;
                  }
                  const buttonElements = [];
                  
                  if (buttons.canPublish && !buttons.canUnpublish) {
                    // Only draft/inactive products - show publish and remove
                    buttonElements.push(
                      <button
                        key="publish"
                        onClick={() => {
                          const productToPublish = pagedProducts.find(p => selectedProducts.includes(String(p.id)));
                          if (productToPublish) {
                            onSelectProduct?.(productToPublish);
                          }
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-semibold text-sm rounded-lg hover:bg-emerald-700 transition-colors"
                      >
                        <Zap className="w-4 h-4 text-white" />
                        Publish
                      </button>
                    );
                  } else if (buttons.canUnpublish && !buttons.canPublish) {
                    // Only published products - show unpublish and remove
                    buttonElements.push(
                      <button
                        key="unpublish"
                        onClick={() => handleBulkRemove()}
                        className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white font-semibold text-sm rounded-lg hover:bg-orange-700 transition-colors"
                      >
                        <EyeOff className="w-4 h-4 text-white" />
                        Unpublish
                      </button>
                    );
                  }
                  
                  // Always show remove button
                  buttonElements.push(
                    <button
                      key="remove"
                      onClick={() => handleBulkRemove()}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold text-sm rounded-lg hover:bg-red-700 transition-colors"
                    >
                      <Trash className="w-4 h-4 text-white" />
                      Remove
                    </button>
                  );
                  
                  return buttonElements;
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Products Table - Desktop List View */}
       {viewMode === 'list' && (
         <div className="overflow-x-auto hidden md:block rounded-lg">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-100 text-gray-500 whitespace-nowrap">
               <th className="text-left py-3 px-4 font-medium text-xs uppercase">
                 <button
                   onClick={handleSelectAll}
                   className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                     selectedProducts.length === pagedProducts.length && pagedProducts.length > 0
                       ? 'bg-green-500 border-green-500'
                       : 'bg-white border-gray-300 hover:border-green-400'
                   }`}
                 >
                   {selectedProducts.length === pagedProducts.length && pagedProducts.length > 0 && (
                     <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                       <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                     </svg>
                   )}
                 </button>
               </th>
               <th className="text-left py-3 px-4 font-medium text-xs uppercase">ID/SKU</th>
               <th className="text-left py-3 px-4 font-medium text-xs uppercase">Product Name</th>
               <th className="text-left py-3 px-4 font-medium text-xs uppercase">Category</th>
               <th className="text-left py-3 px-4 font-medium text-xs uppercase">Brand</th>
               <th className="text-left py-3 px-4 font-medium text-xs uppercase">Stock</th>
               <th className="text-left py-3 px-4 font-medium text-xs uppercase">Purchase Price</th>
               <th className="text-left py-3 px-4 font-medium text-xs uppercase">Selling Price</th>
               <th className="text-left py-3 px-4 font-medium text-xs uppercase">Status</th>
               <th className="text-left py-3 px-4 font-medium text-xs uppercase">Last Updated</th>
               <th className="text-center py-3 px-4 font-medium text-xs uppercase">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pagedProducts.map((product) => (
              <tr 
                key={product.id} 
                className={`border-b border-gray-100 transition cursor-pointer ${
                  selectedProducts.includes(String(product.id)) 
                    ? 'bg-blue-50' 
                    : 'hover:bg-gray-50'
                }`}
                onClick={(e) => handleRowClick(String(product.id), e)}
              >
                <td className="py-3 px-4 text-xs">
                  <button
                    onClick={() => handleProductSelect(String(product.id))}
                    className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                      selectedProducts.includes(String(product.id))
                        ? 'bg-green-500 border-green-500'
                        : 'bg-white border-gray-300 hover:border-green-400'
                    }`}
                  >
                    {selectedProducts.includes(String(product.id)) && (
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                </td>
                <td className="py-3 px-4 text-xs text-gray-900 max-w-25 truncate">
                  <div>
                    <div className="font-medium">{product.sku}</div>
                    <div className="text-gray-500 text-xs truncate">{product.productId}</div>
                  </div>
                </td>
                 <td className="max-w-30 py-3 px-4 text-xs text-gray-900 font-medium truncate">{product.name}</td>
                 <td className="py-3 px-4 text-xs text-gray-700">{product.category}</td>
                 <td className="py-3 px-4 text-xs text-gray-700">{product.brand}</td>
                 <td className="py-3 px-4 text-xs">
                   <div className="flex items-center gap-2">
                     <span className="text-black">
                       {product.stockQuantity}
                     </span>
                     {product.stockQuantity === 0 && (
                       <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-600">
                         Out of Stock
                       </span>
                     )}
                     {product.stockQuantity > 0 && product.stockQuantity <= 50 && (
                       <span className="px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-600">
                         Low Stock
                       </span>
                     )}
                     {product.stockQuantity > 50 && product.stockQuantity <= 100 && (
                       <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-600">
                         Medium Stock
                       </span>
                     )}
                   </div>
                 </td>
                <td className="py-3 px-4 text-xs text-gray-700">{product.purchasePrice}</td>
                <td className="py-3 px-4 text-xs text-gray-700">{product.sellingPrice}</td>
                <td className="py-3 px-4 text-xs">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusBadge(product.status)}`}>
                    {product.status}
                  </span>
                </td>
                <td className="py-3 px-4 text-xs text-gray-700">{format(new Date(product.lastUpdated), 'MMM dd, yyyy')}</td>
                <td className="py-3 px-4 text-xs text-center">
                  <div className="flex items-center justify-center">
                    <button
                      onClick={() => handleEdit(product)}
                      className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-blue-100 transition"
                    >
                      <Eye className="w-4 h-4 text-[#0a61d7]" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
         </table>
       </div>
       )}

       {/* Desktop Grid View */}
       {viewMode === 'grid' && (
         <>
           {/* Select All for Grid View */}
           <div className="hidden md:flex items-center gap-2 mb-4">
             <button
               onClick={handleSelectAll}
               className={`w-5 h-5 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                 selectedProducts.length === pagedProducts.length && pagedProducts.length > 0
                   ? 'bg-green-500 border-green-500'
                   : 'bg-white border-gray-300 hover:border-green-400'
               }`}
             >
               {selectedProducts.length === pagedProducts.length && pagedProducts.length > 0 && (
                 <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                   <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                 </svg>
               )}
             </button>
             <span className="text-sm font-medium text-gray-700">
               Select All ({pagedProducts.length} products)
             </span>
           </div>
           
           <div className="hidden md:grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
           {pagedProducts.map((product) => (
             <div 
               key={product.id} 
               className={`rounded-lg shadow-sm border border-gray-200 p-4 relative cursor-pointer transition ${
                 selectedProducts.includes(String(product.id)) 
                   ? 'bg-blue-50' 
                   : 'bg-white hover:bg-gray-50'
               }`}
               onClick={() => handleProductSelect(String(product.id))}
             >
               {/* Checkbox - Top Right Corner */}
               <div className="absolute top-3 right-3 z-10">
                 <button
                   onClick={(e) => {
                     e.stopPropagation();
                     handleProductSelect(String(product.id));
                   }}
                   className={`w-5 h-5 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                     selectedProducts.includes(String(product.id))
                       ? 'bg-green-500 border-green-500'
                       : 'bg-white border-gray-300 hover:border-green-400'
                   }`}
                 >
                   {selectedProducts.includes(String(product.id)) && (
                     <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                       <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                     </svg>
                   )}
                 </button>
               </div>
               
               {/* Product Image Placeholder */}
               <div className="w-full h-40 bg-gray-100 rounded-lg mb-3 flex items-center justify-center">
                 <div className="text-gray-400 text-sm">Product Image</div>
               </div>
               
               {/* Product Info */}
               <div className="space-y-3">
                 <h3 className="font-medium text-sm text-gray-900 truncate">{product.name}</h3>
                 <p className="text-xs text-gray-500">{product.category}</p>
                 <p className="text-xs text-gray-500">{product.brand}</p>
                 
                 {/* Stock Status */}
                 <div className="flex items-center gap-2">
                   <span className="text-sm font-medium text-gray-900">{product.stockQuantity}</span>
                   {product.stockQuantity === 0 && (
                     <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-600">
                       Out of Stock
                     </span>
                   )}
                   {product.stockQuantity > 0 && product.stockQuantity <= 50 && (
                     <span className="px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-600">
                       Low Stock
                     </span>
                   )}
                   {product.stockQuantity > 50 && product.stockQuantity <= 100 && (
                     <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-600">
                       Medium Stock
                     </span>
                   )}
                 </div>
                 
                 {/* Price */}
                 <div className="text-sm font-semibold text-gray-900">{product.sellingPrice}</div>
                 
                 {/* Status Badge */}
                 <div className="flex items-center justify-between">
                   <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusBadge(product.status)}`}>
                     {product.status}
                   </span>
                   
                   {/* Action Buttons */}
                   <div className="flex items-center gap-1">
                     <button
                       onClick={() => handleEdit(product)}
                       className="p-1.5 rounded-lg hover:bg-blue-100 transition"
                     >
                       <Eye className="w-4 h-4 text-[#0a61d7]" />
                     </button>
                   </div>
                 </div>
               </div>
             </div>
           ))}
         </div>
         </>
       )}

       {/* Mobile Product Catalog View */}
       <div className="md:hidden">
         {/* Select All for Mobile View */}
         <div className="flex items-center gap-2 mb-3">
           <button
             onClick={handleSelectAll}
             className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center ${
               selectedProducts.length === pagedProducts.length && pagedProducts.length > 0
                 ? 'bg-green-500 border-green-500'
                 : 'bg-white border-gray-300 hover:border-green-400'
             }`}
           >
             {selectedProducts.length === pagedProducts.length && pagedProducts.length > 0 && (
               <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                 <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
               </svg>
             )}
           </button>
           <span className="text-sm font-medium text-gray-700">
             Select All ({pagedProducts.length} products)
           </span>
         </div>
         
         <div className="grid grid-cols-2 gap-3">
           {pagedProducts.map((product) => (
             <div 
               key={product.id} 
               className={`rounded-lg shadow-sm border border-gray-200 p-3 relative cursor-pointer transition ${
                 selectedProducts.includes(String(product.id)) 
                   ? 'bg-blue-50' 
                   : 'bg-white hover:bg-gray-50'
               }`}
               onClick={() => handleProductSelect(String(product.id))}
             >
               {/* Checkbox - Top Right Corner */}
               <div className="absolute top-2 right-2 z-10">
                 <button
                   onClick={(e) => {
                     e.stopPropagation();
                     handleProductSelect(String(product.id));
                   }}
                   className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                     selectedProducts.includes(String(product.id))
                       ? 'bg-green-500 border-green-500'
                       : 'bg-white border-gray-300 hover:border-green-400'
                   }`}
                 >
                   {selectedProducts.includes(String(product.id)) && (
                     <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                       <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                     </svg>
                   )}
                 </button>
               </div>
               
               {/* Product Image Placeholder */}
               <div className="w-full h-32 bg-gray-100 rounded-lg mb-3 flex items-center justify-center">
                 <div className="text-gray-400 text-xs">Product Image</div>
               </div>
               
               {/* Product Info */}
               <div className="space-y-2">
                 <h3 className="font-medium text-sm text-gray-900 truncate">{product.name}</h3>
                 <p className="text-xs text-gray-500">{product.category}</p>
                 <p className="text-xs text-gray-500">{product.brand}</p>
                 
                 {/* Stock Status */}
                 <div className="flex items-center gap-2">
                   <span className="text-sm font-medium text-gray-900">{product.stockQuantity}</span>
                   {product.stockQuantity === 0 && (
                     <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-600">
                       Out of Stock
                     </span>
                   )}
                   {product.stockQuantity > 0 && product.stockQuantity <= 50 && (
                     <span className="px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-600">
                       Low Stock
                     </span>
                   )}
                   {product.stockQuantity > 50 && product.stockQuantity <= 100 && (
                     <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-600">
                       Medium Stock
                     </span>
                   )}
                 </div>
                 
                 {/* Price */}
                 <div className="text-sm font-semibold text-gray-900">{product.sellingPrice}</div>
                 
                 {/* Status Badge */}
                 <div className="flex items-center justify-between">
                   <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusBadge(product.status)}`}>
                     {product.status}
                   </span>
                   
                   {/* Action Buttons */}
                   <div className="flex items-center gap-1">
                     <button
                       onClick={() => handleEdit(product)}
                       className="p-1.5 rounded-lg hover:bg-blue-100 transition"
                     >
                       <Eye className="w-4 h-4 text-[#0a61d7]" />
                     </button>
                     
                   </div>
                 </div>
               </div>
             </div>
           ))}
         </div>
       </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4">
        <div className="text-sm text-gray-500">
          Showing {fromRow} to {toRow} of {totalRows} results
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pageNum = i + 1;
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`px-3 py-2 text-sm rounded-lg ${
                    page === pageNum
                      ? 'bg-[#0a61d7] text-white'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
            {totalPages > 5 && (
              <>
                {totalPages > 6 && <span className="px-2 text-gray-500">...</span>}
                <button
                  onClick={() => setPage(totalPages)}
                  className={`px-3 py-1 text-sm rounded ${
                    page === totalPages
                      ? 'bg-[#0a61d7] text-white'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {totalPages}
                </button>
              </>
            )}
          </div>
          
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-lg p-4 w-full max-w-sm">
            <h2 className="text-lg font-bold mb-2 text-red-500">
              {isBulkDelete ? 'Delete Products' : 'Delete Product'}
            </h2>
            <p className="mb-4 text-gray-500">
              {isBulkDelete 
                ? `Are you sure you want to delete ${selectedProducts.length} product${selectedProducts.length === 1 ? '' : 's'}? This action cannot be undone.`
                : `Are you sure you want to delete this product? This action cannot be undone.`
              }
            </p>
            {isBulkDelete && (
              <p className="mb-4 text-xs text-orange-600 bg-orange-50 p-2 rounded">
                <strong>Note:</strong> Deleting products will remove them from publication in the marketplace.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300"
                onClick={handleDeleteCancel}
              >
                Cancel
              </button>
              <button
                className={`px-4 py-2 rounded-lg text-white hover:opacity-90 ${
                  isBulkDelete ? 'bg-red-600 hover:bg-red-700' : 'bg-red-600 hover:bg-red-700'
                }`}
                onClick={handleDeleteConfirm}
              >
                {isBulkDelete ? 'Delete' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Marketplace Publication Preview Modal */}
      {/* This modal is no longer needed as the publish functionality is integrated into the main table */}
      {/* Keeping it for now, but it might be removed if not used */}
      {/* {showProductMarketplacePubs && selectedProductForPub && (
        <ProductMarketplacePubs
          product={selectedProductForPub}
          isOpen={showProductMarketplacePubs}
          onClose={() => {
            setShowProductMarketplacePubs(false);
            setSelectedProductForPub(null);
          }}
        />
      )} */}
    </div>
  );
}

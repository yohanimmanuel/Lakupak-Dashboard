'use client';
import { SkeletonTablePage } from '@/components/skeleton/SkeletonTablePage';
import React, { useState, useEffect, useRef, useCallback } from "react";
import ProductCards from "@/components/productscatalogs/ProductCards";
import ProductTable from "@/components/productscatalogs/ProductTable";
import ProductImport from "@/components/productscatalogs/ProductImport";
import { Upload, Download, Check, RefreshCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useUserStore } from "@/store/userStore";
import * as XLSX from 'xlsx';
import { Product, ProductImportRow, ProductImportResult, ProductTableRow } from "@/types/product";
import { formatDate } from "@/utils/dateUtils";
import { generateUniqueProductId } from "@/utils/product-security";
import { formatCurrency, parsePrice } from "@/utils/currencyUtils";
import { fetchGraphQL } from "@/lib/graphqlClient";
import { useProductUpdateSocket } from '@/hooks/useProductUpdateSocket';
import { usePendingDashboardTourStart } from '@/hooks/usePendingDashboardTourStart';
import { useProductsTranslations } from '@/hooks/useProductsTranslations';

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
  const { tList } = useProductsTranslations();
  const user = useUserStore(state => state.user);
  const userCurrency = user?.currency || 'IDR';
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  
  // Enhanced state management for overlay animations
  const [showOverlay, setShowOverlay] = useState(false);
  const [overlayMessage, setOverlayMessage] = useState('');
  const [isSlidingIn, setIsSlidingIn] = useState(false);
  const [isSlidingOut, setIsSlidingOut] = useState(false);
  const overlayTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const suppressSocketRefreshRef = useRef(false);

  const withSuppressedAutoRefresh = useCallback(async (action: () => Promise<void>) => {
    suppressSocketRefreshRef.current = true;
    try {
      await action();
    } finally {
      suppressSocketRefreshRef.current = false;
    }
  }, []);

  // GraphQL query to fetch products
  const PRODUCTS_QUERY = `
    query GetProducts($userId: Int!, $page: Int, $limit: Int) {
      products(userId: $userId, page: $page, limit: $limit) {
        nodes {
          id
          productId
          sku
          name
          description
          productType
          brand
          supplier
          status
          productCategory
          catalogName
          images
          halalCertified
          bpomApproved
          originalProduct
          returnPolicyDays
          stockQuantity
          lowStockThreshold
          stockStatus
          variantOptions {
            id
            variantName
            sku
            purchasePrice
            sellingPrice
            originalSellingPrice
            moq
            stockQuantity
            lowStockThreshold
            stockStatus
            isDefault
            isActive
            attributes
          }
          variantDefinitions
          createdAt
          updatedAt
          userId
          hasActiveOffer
          offerBadge
          offerId
          offerName
          discountType
          discountValue
          promotionDetails
          originalPrice
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

  // Fetch products from GraphQL API
  const fetchProducts = useCallback(async (forceRefresh = false, silent = false) => {
    if (!user?.id) return;

    if (!silent) {
      setLoading(true);

      if (overlayTimeoutRef.current) {
        clearTimeout(overlayTimeoutRef.current);
      }

      if (products.length > 0) {
        setIsSlidingOut(false);
        setIsSlidingIn(true);
        setOverlayMessage(tList('refreshingOverlay'));
      }
    }

    try {
      const data = await fetchGraphQL<{
        products: {
          nodes: Product[];
          pagination: {
            page: number;
            limit: number;
            totalCount: number;
            totalPages: number;
          };
        };
      }>(PRODUCTS_QUERY, {
        userId: user.id,
        page: 1,
        limit: 1000,
      }, forceRefresh ? { cache: 'no-store' } : {});

      const productsData = data.products.nodes;
      setProducts(productsData);

      if (!silent) {
        setOverlayMessage(tList('loadedOverlay', { count: productsData.length }));
      }
    } catch (error) {
      setProducts([]);
      if (!silent) {
        setOverlayMessage(tList('errorOverlay'));
      }
    } finally {
      if (!silent) {
        setLoading(false);

        setTimeout(() => {
          setIsSlidingIn(false);
          setShowOverlay(true);
        }, 1500);

        overlayTimeoutRef.current = setTimeout(() => {
          setIsSlidingOut(true);
          setShowOverlay(false);

          setTimeout(() => {
            setIsSlidingOut(false);
          }, 500);
        }, 2500);
      }
    }
  }, [user?.id]);

  useEffect(() => {
    // Start slide-in animation immediately for initial page load
    setIsSlidingIn(true);
    setOverlayMessage(tList('loadingOverlay'));
    
    fetchProducts();
    
    // Cleanup timeout on unmount
    return () => {
      if (overlayTimeoutRef.current) {
        clearTimeout(overlayTimeoutRef.current);
      }
    };
  }, [fetchProducts]); // Use fetchProducts instead of user?.id since fetchProducts is properly memoized

  // Keep product table in sync with stock/price changes triggered elsewhere (e.g. order status transitions).
  // When we receive a product broadcast, force-refresh to bypass any cache.
  useProductUpdateSocket(user?.id, () => {
    if (suppressSocketRefreshRef.current) return;
    fetchProducts(true);
  });

  usePendingDashboardTourStart('products', { ready: !loading && !!user?.id });

  // Convert product data to table row format
  const profileToTableRow = (product: Product): ProductTableRow => {
    const variantOptions = product.variantOptions || [];
    const variantOptionsStock = variantOptions.reduce(
      (total, option) => ({
        totalStock: total.totalStock + (option.stockQuantity || 0),
        lowStockThreshold: Math.max(total.lowStockThreshold, option.lowStockThreshold || 0),
      }),
      { totalStock: 0, lowStockThreshold: 0 },
    );

    const totalStock = variantOptionsStock.totalStock;
    const totalLowStockThreshold = variantOptionsStock.lowStockThreshold;
    
    // Calculate price range for selling price
    let sellingPrice = 'Rp 0';
    if (variantOptions.length > 0) {
      const prices = variantOptions
        .map(option => parsePrice(String(option.sellingPrice), userCurrency) || 0)
        .filter(price => price > 0);
      
      if (prices.length > 0) {
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        
        if (minPrice === maxPrice) {
          sellingPrice = formatCurrency(minPrice, userCurrency);
        } else {
          sellingPrice = `${formatCurrency(minPrice, userCurrency)} – ${formatCurrency(maxPrice, userCurrency)}`;
        }
      }
    }
    
    const firstVariantOption = variantOptions[0];
    
    return {
      id: product.id || 0,
      productId: product.productId,
      sku: product.sku,
      name: product.name,
      productType: product.productType,
      brand: product.brand,
      supplier: product.supplier,
      stockQuantity: totalStock, // Total stock from all variants
      lowStockThreshold: totalLowStockThreshold, // Total threshold from all variants
      purchasePrice: firstVariantOption?.purchasePrice || '0',
      sellingPrice: sellingPrice, // Price range or single price
      packageType: 'Piece', // Default to piece-based
      piecesPerPackage: 1, // Default to 1 piece per package
      variantOptions: variantOptions, // Include variantOptions for price calculation
      
      status: product.status,
      createdAt: product.createdAt ? formatDate(product.createdAt) : 'N/A',
      lastUpdated: product.updatedAt ? formatDate(product.updatedAt) : 'N/A',
      userId: product.userId || 0
    };
  };

  // Use the enhanced generateUniqueProductId from security utils
  const generateLKPProductId = () => generateUniqueProductId();

  const CREATE_PRODUCT_MUTATION = `
    mutation CreateProduct(
      $userId: Int!
      $productId: String
      $sku: String
      $name: String!
      $description: String!
      $productType: String!
      $brand: String!
      $supplier: String!
      $status: String
      $productCategory: String!
      $catalogName: String
      $images: [String!]
      $halalCertified: Boolean
      $bpomApproved: Boolean
      $originalProduct: Boolean
      $returnPolicyDays: Int
      $currency: String
      $variantOptions: [VariantOptionInput!]
    ) {
      createProduct(
        userId: $userId
        productId: $productId
        sku: $sku
        name: $name
        description: $description
        productType: $productType
        brand: $brand
        supplier: $supplier
        status: $status
        productCategory: $productCategory
        catalogName: $catalogName
        images: $images
        halalCertified: $halalCertified
        bpomApproved: $bpomApproved
        originalProduct: $originalProduct
        returnPolicyDays: $returnPolicyDays
        currency: $currency
        variantOptions: $variantOptions
      ) {
        id
        productId
        sku
        name
      }
    }
  `;

  const showImportOverlay = (message: string) => {
    setOverlayMessage(message);
    setIsSlidingIn(true);
    setShowOverlay(true);

    if (overlayTimeoutRef.current) {
      clearTimeout(overlayTimeoutRef.current);
    }
    overlayTimeoutRef.current = setTimeout(() => {
      setIsSlidingOut(true);
      setShowOverlay(false);
      setTimeout(() => {
        setIsSlidingOut(false);
      }, 500);
    }, 4000);
  };

  const handleImport = async (data: ProductImportRow[]): Promise<ProductImportResult> => {
    if (!user?.id) {
      throw new Error('User not authenticated');
    }

    let succeeded = 0;
    let failed = 0;

    suppressSocketRefreshRef.current = true;
    try {
      for (const product of data) {
        const stockQuantity = parseInt(product['Stock Quantity'], 10) || 0;
        const lowStockThreshold = parseInt(product['Low Stock Threshold'], 10) || 30;
        const moqRaw = product['MOQ']?.trim();
        const moq = moqRaw ? parseInt(moqRaw, 10) : null;

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
          productType: product['Product Type'] || '',
          brand: product['Brand'] || '',
          supplier: product['Supplier'] || '',
          stockQuantity,
          lowStockThreshold,
          stockStatus,
          purchasePrice: String(product['Purchase Price'] || ''),
          sellingPrice: String(product['Selling Price'] || ''),
          status: 'Draft' as const,
          productCategory: product['Product Category'] || '',
          catalogName: product['Catalog Name'] || '',
          images: [] as string[],
        };

        const variantOption = {
          variantName: 'Default',
          attributes: {},
          sku: payload.sku || null,
          purchasePrice: payload.purchasePrice,
          sellingPrice: payload.sellingPrice,
          originalSellingPrice: null,
          moq: Number.isFinite(moq) ? moq : null,
          stockQuantity: payload.stockQuantity,
          lowStockThreshold: payload.lowStockThreshold,
          stockStatus: payload.stockStatus,
          isDefault: true,
          isActive: true,
        };

        try {
          await fetchGraphQL(CREATE_PRODUCT_MUTATION, {
            userId: user.id,
            productId: payload.productId,
            sku: payload.sku,
            name: payload.name,
            description: payload.description,
            productType: payload.productType,
            brand: payload.brand,
            supplier: payload.supplier,
            status: payload.status,
            productCategory: payload.productCategory,
            catalogName: payload.catalogName || null,
            images: payload.images,
            halalCertified: false,
            bpomApproved: false,
            originalProduct: true,
            returnPolicyDays: 7,
            currency: userCurrency,
            variantOptions: [variantOption],
          });
          succeeded += 1;
        } catch {
          failed += 1;
        }
      }

      await fetchProducts(true, true);
    } finally {
      suppressSocketRefreshRef.current = false;
    }

    if (succeeded === 0) {
      showImportOverlay(tList('importAllFailed', { count: failed }));
      throw new Error('Import failed');
    }

    if (failed > 0) {
      showImportOverlay(
        tList('importPartialSuccess', { succeeded, failed }) +
          ' ' +
          tList('importDraftReminder')
      );
    } else {
      showImportOverlay(
        tList('importSuccess', { count: succeeded }) + ' ' + tList('importDraftReminder')
      );
    }

    return { succeeded, failed };
  };

  const handleExport = () => {
    // Export products data to XLSX
    const headers = ['Product ID', 'SKU', 'Product Name', 'Type', 'Brand', 'Supplier', 'Stock Quantity', 'Purchase Price', 'Selling Price', 'Status', 'Last Updated'];
    const rows = products.map(product => {
      const variantOptions = product.variantOptions || [];
      // Calculate price range for selling price
      let sellingPrice = '0';
      if (variantOptions.length > 0) {
        const prices = variantOptions
          .map(option => parseFloat(option.sellingPrice) || 0)
          .filter(price => price > 0);
        
        if (prices.length > 0) {
          const minPrice = Math.min(...prices);
          const maxPrice = Math.max(...prices);
          
          if (minPrice === maxPrice) {
            sellingPrice = `Rp ${minPrice.toLocaleString('id-ID')}`;
          } else {
            sellingPrice = `Rp ${minPrice.toLocaleString('id-ID')} – Rp ${maxPrice.toLocaleString('id-ID')}`;
          }
        }
      }
      
      // Calculate total stock
      const variantOptionsStock = variantOptions.reduce((total, option) => ({
        totalStock: total.totalStock + (option.stockQuantity || 0),
        lowStockThreshold: Math.max(total.lowStockThreshold, option.lowStockThreshold || 0)
      }), { totalStock: 0, lowStockThreshold: 0 }) || { totalStock: 0, lowStockThreshold: 0 };
      
      const totalStock = variantOptionsStock.totalStock;
      
      return [
        product.productId || `LKP-${String(product.id).padStart(8, '0')}`, // Fallback to LKP format if no productId
        product.sku,
        product.name,
        product.productType,
        product.brand,
        product.supplier,
        totalStock,
        variantOptions[0]?.purchasePrice || '0',
        sellingPrice, // Price range or single price
        product.status,
        product.updatedAt ? formatDate(product.updatedAt) : 'N/A'
      ];
    });
    
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Products');
    
    // Generate filename with current date
    const currentDate = new Date().toISOString().split('T')[0];
    const filename = `products_export_${currentDate}.xlsx`;
    
    downloadXLSX(wb, filename);
  };

  if (loading) {
    return <SkeletonTablePage statCards={4} rows={8} />;
  }

  return (
    <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-2">
        <div data-tour="products-page-header">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{tList('title')}</h1>
          <p className="text-sm text-gray-500 mb-4">{tList('subtitle')}</p>
        </div>
        {/* Action Buttons */}
        <div className="flex items-center gap-3" data-tour="products-actions">
          {/* Refresh Button */}
          <button
            onClick={() => fetchProducts(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-[#e6e6e6] text-black rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            <RefreshCcw className="w-4 h-4" />
            {tList('refresh')}
          </button>

          {/* Import Draft Products */}
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-[#e6e6e6] text-black rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            <Upload className="w-4 h-4" />
            {tList('importDraftProducts')}
          </button>

          {/* Export Button */}
          <button
            onClick={() => handleExport()}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-[#e6e6e6] text-black rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            {tList('exportData')}
          </button>

          {/* Add Product Button */}
          <button
            onClick={() => router.push('/products/add')}
            className="flex items-center gap-2 px-6 py-2 bg-[#0a61d7] font-semibold text-white rounded-lg hover:bg-[#0851b8] transition-colors text-sm font-medium"
          >
            {tList('addProduct')}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div data-tour="products-cards">
        <ProductCards products={products} />
      </div>

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
                {loading ? tList('pleaseWait') : products.length === 1 ? tList('productsLoaded', { count: products.length }) : tList('productsLoadedPlural', { count: products.length })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons and Table */}
      <div>
        <ProductImport 
          open={isImportModalOpen}
          onCloseAction={() => setIsImportModalOpen(false)}
          onImportAction={handleImport}
        />
        <ProductTable 
          products={products}
          setProductsAction={setProducts}
          profileToTableRowAction={profileToTableRow}
          onExportXLSXAction={downloadXLSX}
          onRefreshProductsAction={fetchProducts}
          withSuppressedAutoRefreshAction={withSuppressedAutoRefresh}
        />
      </div>
    </div>
  );
}

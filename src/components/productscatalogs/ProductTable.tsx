'use client';
import React, { useState, useRef, useLayoutEffect, useEffect, useCallback } from "react";
import { useRouter } from 'next/navigation';
import { Search, Edit, Filter, Calendar, ChevronDown, ChevronLeft, ChevronRight, Trash, Trash2, MoreHorizontal, Grid3X3, List, EyeClosed, Globe, Zap, EyeOff, Gift, Package, AlertCircle, Loader2 } from "lucide-react";

import { useUserStore } from '@/store/userStore';
import ProductMarketplacePubs from '../productscatalogs/ProductMarketplacePubs';
import * as XLSX from 'xlsx';
import { Product, ProductTableRow } from "@/types/product";
import { formatCurrency, getDefaultCurrency, parsePrice } from '@/utils/currencyUtils';
import { formatNumberByCurrency } from '@/config/currencyConfig';
import { getProductTotalStock } from '../../utils/stockUtils';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useProductsTranslations } from '@/hooks/useProductsTranslations';

const statusTabs = [
  { label: "All" },
  { label: "Draft" },
  { label: "Published" },
];

const stockFilters = [
  { label: "All Stock", value: "all" },
  { label: "High Stock", value: "high" },
  { label: "Low Stock", value: "low" },
  { label: "Out of Stock", value: "out" },
];

const offerFilters = [
  { label: "All Products", value: "all" },
  { label: "With Offers", value: "with_offers" },
  { label: "Without Offers", value: "without_offers" },
];

// Dynamic filters based on existing products
const getTypeFilters = (products: Product[]) => {
  const categories = new Set(products.map(product => product.productType).filter(Boolean));
  return ["All Types", ...Array.from(categories)];
};

const getProductCategoryFilters = (products: Product[]) => {
  const cats = new Set(products.map(product => product.productCategory).filter(Boolean));
  return ["All Categories", ...Array.from(cats)];
};


export default function ProductTable({ products = [], setProductsAction, onSelectProductAction, onExportXLSXAction, profileToTableRowAction, onRefreshProductsAction, withSuppressedAutoRefreshAction }: { 
  products?: Product[]; 
  setProductsAction?: (fn: (prev: Product[]) => Product[]) => void; 
  onSelectProductAction?: (product: Product) => void; 
  onExportXLSXAction?: (wb: XLSX.WorkBook, filename: string) => void; 
  profileToTableRowAction: (product: Product) => ProductTableRow;
  onRefreshProductsAction?: (forceRefresh?: boolean, silent?: boolean) => Promise<void>;
  withSuppressedAutoRefreshAction?: (action: () => Promise<void>) => Promise<void>;
}) {
  const {
    tShared,
    tTable,
    translateStatusTab,
    translateStatus,
    translateStockFilter,
    translateOfferFilter,
    translateFilter,
    translateStockStatus,
    translateCategory,
  } = useProductsTranslations();
  const user = useUserStore(state => state.user);
  const userCurrency = user?.currency || getDefaultCurrency();

  const getPromotionLabel = (minQuantity: number, freeQuantity: number) =>
    tTable('offers.buyXGetY', { min: minQuantity, free: freeQuantity });

  const getBulkSelectionMessage = (
    buttons: { canPublish: boolean; canUnpublish: boolean; canRemove: boolean },
    isDesktop = false,
  ) => {
    if (buttons.canPublish && buttons.canUnpublish) {
      return tTable('selection.mixedStatuses');
    }
    if (buttons.canPublish) {
      return tTable('selection.publishHint');
    }
    if (buttons.canUnpublish) {
      return isDesktop ? tTable('selection.unpublishHintDesktop') : tTable('selection.unpublishHint');
    }
    return isDesktop ? tTable('selection.removeHintDesktop') : tTable('selection.removeHint');
  };

  const getTypeFilterLabel = (type: string) =>
    type === 'All Types' ? translateFilter(type) : translateCategory(type);

  const getProdCategoryFilterLabel = (value: string) =>
    value === 'All Categories' ? translateFilter(value) : value;

  // Helper function to calculate original price range from variantOptions
  const getOriginalPriceRange = (originalProduct: Product | undefined): string | null => {
    if (!originalProduct) return null;
    
    const variantOptions = originalProduct.variantOptions || [];
    
    // Collect all originalSellingPrices
    const originalPrices: number[] = [];
    
    // Add prices from variantOptions
    variantOptions.forEach(option => {
      if (option.originalSellingPrice && option.originalSellingPrice !== '') {
        const price = parsePrice(String(option.originalSellingPrice), userCurrency);
        if (price > 0) {
          originalPrices.push(price);
        }
      }
    });
    
    if (originalPrices.length === 0) return null;
    
    const minPrice = Math.min(...originalPrices);
    const maxPrice = Math.max(...originalPrices);
    
    if (minPrice === maxPrice) {
      return formatCurrency(minPrice, userCurrency);
    } else {
      return `${formatCurrency(minPrice, userCurrency)} – ${formatCurrency(maxPrice, userCurrency)}`;
    }
  };

  const getDiscountBadgeLabel = (originalProduct: Product | undefined): string | null => {
    if (!originalProduct) return null;
    if (!originalProduct.discountType) return null;

    const numericValue = originalProduct.discountValue !== undefined && originalProduct.discountValue !== null
      ? Number(originalProduct.discountValue)
      : undefined;

    if (originalProduct.discountType === 'percentage') {
      if (numericValue === undefined || Number.isNaN(numericValue) || numericValue <= 0) {
        return null;
      }
      const formatted = Number.isInteger(numericValue)
        ? numericValue.toString()
        : numericValue.toFixed(2).replace(/\.?0+$/, '');
      return tTable('offers.percentOff', { value: formatted });
    }

    if (originalProduct.discountType === 'fixed') {
      if (numericValue === undefined || Number.isNaN(numericValue) || numericValue <= 0) {
        return null;
      }
      return tTable('offers.fixedOff', { value: formatCurrency(numericValue, userCurrency) });
    }

    return null;
  };

  const getCalculatedDiscountLabel = (originalProduct: Product | undefined, sellingPrice: string): string => {
    const fromHelper = getDiscountBadgeLabel(originalProduct);
    if (fromHelper) return fromHelper;

    if (originalProduct?.discountType === 'fixed' && originalProduct.discountValue) {
      return tTable('offers.fixedOff', { value: formatCurrency(originalProduct.discountValue, userCurrency) });
    }

    if (originalProduct?.variantOptions?.[0]?.originalSellingPrice) {
      const originalPrice = parsePrice(originalProduct.variantOptions[0].originalSellingPrice || '', userCurrency);
      const currentPrice = parsePrice(String(sellingPrice), userCurrency);
      if (originalPrice > currentPrice && originalPrice > 0) {
        const discountPercent = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
        return tTable('offers.percentOff', { value: discountPercent.toString() });
      }
    }

    return tTable('offers.discount');
  };

  const tableRows = products.map(profileToTableRowAction);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedTab, setSelectedTab] = useState("All");
  const [selectedStockFilter, setSelectedStockFilter] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("All Types");
  const [selectedProdCategory, setSelectedProdCategory] = useState("All Categories");
  const [selectedOfferFilter, setSelectedOfferFilter] = useState("all");
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  
  // Get dynamic filters based on current products
  const categoryFilters = getTypeFilters(products);
  const prodCategoryFilters = getProductCategoryFilters(products);
  const [showStockDropdown, setShowStockDropdown] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showProdCategoryDropdown, setShowProdCategoryDropdown] = useState(false);
  const [showOfferDropdown, setShowOfferDropdown] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [productToDelete, setProductToDelete] = useState<ProductTableRow | null>(null);
  const [isBulkDelete, setIsBulkDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [productToPublish, setProductToPublish] = useState<ProductTableRow | null>(null);
  const [showUnpublishModal, setShowUnpublishModal] = useState(false);
  const [isBulkUnpublish, setIsBulkUnpublish] = useState(false);
  const [isUnpublishing, setIsUnpublishing] = useState(false);
  
  const router = useRouter();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });
  const rowsPerPage = 8;

  // Filter products based on search, status, category, and stock
  let filteredProducts = tableRows.filter((p: ProductTableRow) => String(p.name).toLowerCase().includes(search.toLowerCase()));
  
  if (selectedTab !== "All") filteredProducts = filteredProducts.filter((p: ProductTableRow) => p.status === selectedTab);
  if (selectedCategory !== "All Types") filteredProducts = filteredProducts.filter((p: ProductTableRow) => p.productType === selectedCategory);
  if (selectedProdCategory !== "All Categories") filteredProducts = filteredProducts.filter((p: ProductTableRow) => (products.find(x => x.productId === p.productId)?.productCategory) === selectedProdCategory);
  
  if (selectedStockFilter !== "all") {
    filteredProducts = filteredProducts.filter((p: ProductTableRow) => {
      const productStock = getProductTotalStock(p.variantOptions || []);
      const stock = productStock.totalStock;
      const threshold = productStock.lowStockThreshold;
      if (selectedStockFilter === "high") return threshold > 0 ? stock > threshold : stock > 0;
      if (selectedStockFilter === "low") return threshold > 0 ? stock <= threshold && stock > 0 : false;
      if (selectedStockFilter === "out") return stock === 0;
      return true;
    });
  }

  // Filter by offer status
  if (selectedOfferFilter !== "all") {
    filteredProducts = filteredProducts.filter((p: ProductTableRow) => {
      const product = products.find(x => x.productId === p.productId);
      if (!product) return false;
      
      const hasOffer = product.hasActiveOffer || 
                      product.offerBadge || 
                      product.originalPrice || 
                      product.offerName || 
                      product.discountType ||
                      product.promotionDetails;
      
      if (selectedOfferFilter === "with_offers") return hasOffer;
      if (selectedOfferFilter === "without_offers") return !hasOffer;
      return true;
    });
  }

  const totalRows = filteredProducts.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
  const pagedProducts = filteredProducts.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  const fromRow = totalRows === 0 ? 0 : (page - 1) * rowsPerPage + 1;
  const toRow = Math.min(page * rowsPerPage, totalRows);

  // GraphQL mutation to delete product
  const DELETE_PRODUCT_MUTATION = `
    mutation DeleteProduct($userId: Int!, $id: String!) {
      deleteProduct(userId: $userId, id: $id) {
        success
        deleted {
          id
          productId
        }
      }
    }
  `;

  const handleDeleteConfirm = useCallback(async () => {
    if (!user?.id) return;

    setIsDeleting(true);
    setDeleteError('');

    const runDelete = async () => {
      const deletedProductIds: string[] = [];

      if (isBulkDelete) {
        const deleteResults = await Promise.all(
          selectedProducts.map(async (productId) => {
            const product = tableRows.find((p) => String(p.id) === productId);
            if (product) {
              await fetchGraphQL(DELETE_PRODUCT_MUTATION, {
                userId: user.id,
                id: product.productId,
              });
              return product.productId;
            }
            return null;
          }),
        );

        deletedProductIds.push(
          ...deleteResults.filter((productId): productId is string => Boolean(productId)),
        );
        setSelectedProducts([]);
      } else {
        if (!productToDelete) return;
        const deletedProductId = productToDelete.productId;
        await fetchGraphQL(DELETE_PRODUCT_MUTATION, {
          userId: user.id,
          id: deletedProductId,
        });
        deletedProductIds.push(deletedProductId);
        setProductToDelete(null);
      }

      if (setProductsAction && deletedProductIds.length > 0) {
        setProductsAction((prev) =>
          prev.filter((product) => !deletedProductIds.includes(product.productId)),
        );
      }

      const currentPageDeleteCount = pagedProducts.filter((product) =>
        deletedProductIds.includes(product.productId),
      ).length;

      if (page > 1 && currentPageDeleteCount > 0 && pagedProducts.length <= currentPageDeleteCount) {
        setPage(1);
      }

      setShowDeleteModal(false);
      setIsBulkDelete(false);

      if (onRefreshProductsAction) {
        await onRefreshProductsAction(true);
      }
    };

    try {
      if (withSuppressedAutoRefreshAction) {
        await withSuppressedAutoRefreshAction(runDelete);
      } else {
        await runDelete();
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : tShared('deleteFailed');
      setDeleteError(errorMessage);
    } finally {
      setIsDeleting(false);
    }
  }, [
    user?.id,
    isBulkDelete,
    selectedProducts,
    tableRows,
    productToDelete,
    page,
    pagedProducts,
    setProductsAction,
    onRefreshProductsAction,
    withSuppressedAutoRefreshAction,
    tShared,
  ]);

  const handleDeleteCancel = useCallback(() => {
    setShowDeleteModal(false);
    setProductToDelete(null);
    setIsBulkDelete(false);
    setDeleteError('');
  }, []);

  const handleUnpublishCancel = () => {
    if (isUnpublishing) return;
    setShowUnpublishModal(false);
    setIsBulkUnpublish(false);
  };

  // Check if product is complete for marketplace publishing
  const isProductComplete = (productId: string): boolean => {
    const product = products.find(p => p.productId === productId);
    if (!product) return false;
    
    // Check if product has at least one complete variant (piece-based system)
    const hasCompleteVariant =
      (product.variantOptions && product.variantOptions.length > 0 &&
        product.variantOptions.some(option =>
          option.purchasePrice &&
          option.sellingPrice &&
          option.isActive
        ));
    
    // Check variant-level stock (piece-based system)
    const variantOptionsStock = product.variantOptions?.reduce((total, option) => ({
      totalStock: total.totalStock + (option.stockQuantity || 0),
      lowStockThreshold: Math.max(total.lowStockThreshold, option.lowStockThreshold || 0)
    }), { totalStock: 0, lowStockThreshold: 0 }) || { totalStock: 0, lowStockThreshold: 0 };
    
    const totalStock = variantOptionsStock.totalStock;
    // Marketplace publishing requires product to have stock on hand.
    // Note: `totalStock` is a sum of variant stock quantities and will not go negative.
    const hasStock = totalStock > 0;
    
    // Check required fields for marketplace publishing
    const hasRequiredFields = Boolean(product.sku && 
                             product.name && 
                             product.description && 
                             product.productType && 
                             product.brand && 
                             product.supplier && 
                             hasCompleteVariant &&
                             hasStock);
    
    const hasImages = Boolean(product.images && product.images.length > 0);
    
    return hasRequiredFields && hasImages;
  };

  // GraphQL mutation to publish/unpublish marketplace product
  const PUBLISH_MARKETPLACE_MUTATION = `
    mutation PublishMarketplaceProduct($userId: Int!, $productId: String!, $action: String!) {
      publishMarketplaceProduct(userId: $userId, productId: $productId, action: $action) {
        success
        message
        product {
        id
        productId
        status
        }
      }
    }
  `;

  const BULK_PUBLISH_MARKETPLACE_MUTATION = `
    mutation BulkPublishMarketplaceProducts($userId: Int!, $productIds: [String!]!, $action: String!) {
      bulkPublishMarketplaceProducts(userId: $userId, productIds: $productIds, action: $action) {
        success
        message
        successful
        failed
      }
    }
  `;

  const handlePublishProduct = async () => {
    // This callback is called AFTER the modal has already published products
    // Just update state to reflect the published status - don't republish!
    if (!user?.id) return;
    
    try {
      // Update state for all selected products to Published status
      // The modal already handled the actual publishing
      if (selectedProducts.length > 0 && setProductsAction) {
        const productIds = selectedProducts
          .map(productId => tableRows.find(p => String(p.id) === productId))
          .filter((product): product is ProductTableRow => product !== undefined)
          .map(product => product.productId);

        setProductsAction(prev => prev.map(p => 
          productIds.includes(p.productId)
            ? { ...p, status: 'Published' as const }
            : p
        ));
      } else if (productToPublish && setProductsAction) {
        // Single product update
        setProductsAction(prev => prev.map(p => 
              p.productId === productToPublish.productId 
            ? { ...p, status: 'Published' as const }
                : p
            ));
          }
      
          // Clear selection and close modal
          setSelectedProducts([]);
          setShowPublishModal(false);
          setProductToPublish(null);
        } catch (error) {
      // Error updating state
      }
  };

  const handleUnpublishProducts = async () => {
    if (!user?.id || selectedProducts.length === 0 || isUnpublishing) return;

    setIsUnpublishing(true);
    try {
      // Bulk unpublish - use single bulk mutation to avoid browser connection limits
      const productsToUnpublish = selectedProducts
        .map(productId => tableRows.find(p => String(p.id) === productId))
        .filter((product): product is ProductTableRow => 
          product !== undefined && product.status === 'Published'
        );

      const productIds = productsToUnpublish.map(p => p.productId);
      
      const result = await fetchGraphQL<{
        bulkPublishMarketplaceProducts: {
          success: boolean;
          message: string;
          successful: string[];
          failed: string[];
        };
      }>(BULK_PUBLISH_MARKETPLACE_MUTATION, {
              userId: user.id,
        productIds,
        action: 'unpublish',
      });

      // Update state for all successful products
      if (setProductsAction && result.bulkPublishMarketplaceProducts?.successful.length > 0) {
        setProductsAction(prev => prev.map(p => 
          result.bulkPublishMarketplaceProducts.successful.includes(p.productId)
            ? { ...p, status: 'Draft' as const }
                : p
            ));
      }
      
      // Clear selection after unpublishing
      setSelectedProducts([]);
      
      // Close the unpublish modal
      setShowUnpublishModal(false);
      setIsBulkUnpublish(false);
          } catch (error) {
        // Error unpublishing products
      } finally {
      setIsUnpublishing(false);
    }
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

  // Check if all filtered products are selected (not just current page)
  const allFilteredProductIds = React.useMemo(() => 
    filteredProducts.map(product => String(product.id)), 
    [filteredProducts]
  );
  const allFilteredSelected = React.useMemo(() => 
    allFilteredProductIds.length > 0 && allFilteredProductIds.every(id => selectedProducts.includes(id)),
    [allFilteredProductIds, selectedProducts]
  );

  const handleSelectAll = () => {
    if (allFilteredSelected) {
      // Deselect all filtered products
      setSelectedProducts(prev => prev.filter(id => !allFilteredProductIds.includes(id)));
    } else {
      // Select all filtered products (add to existing selection)
      setSelectedProducts(prev => {
        const newSelection = [...prev];
        allFilteredProductIds.forEach(id => {
          if (!newSelection.includes(id)) {
            newSelection.push(id);
          }
        });
        return newSelection;
      });
    }
  };

  const handleBulkRemove = () => {
    setIsBulkDelete(true);
    setShowDeleteModal(true);
  };

  const handleBulkUnpublish = () => {
    setIsBulkUnpublish(true);
    setShowUnpublishModal(true);
  };


  const handleOpenPublishModal = (product: ProductTableRow) => {
    // Always show the modal - let ProductMarketplacePubs handle smart identification
    setProductToPublish(product);
    setShowPublishModal(true);
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

  const handleView = (product: ProductTableRow) => {
    router.push(`/products/catalog/${product.productId}`);
  };

  const handleEdit = (product: ProductTableRow) => {
    router.push(`/products/edit/${product.productId}`);
  };

  const handleDelete = async (product: ProductTableRow) => {
    setProductToDelete(product);
    setIsBulkDelete(false);
    setShowDeleteModal(true);
  };

  const tabIdx = statusTabs.findIndex(tab => tab.label === selectedTab);

  // Status color helper
  const statusBadge = (status: string) => {
    if (status === "Published" || status === "Active") return "bg-green-100 text-green-500 font-semibold";
    if (status === "Draft" || status === "Inactive") return "bg-gray-100 text-gray-500 font-semibold";
    return "bg-gray-100 text-gray-500 font-semibold";
  };

  return (
    <div className="w-full mx-auto bg-white rounded-lg border border-[#e6e6e6] p-4 mt-3" data-tour="products-table">
      {/* Status Tabs - Segmented Control */}
      <div className="mb-4">
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
                {translateStatusTab(tab.label)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
        {/* Search Bar - Left Side */}
        <div className="relative w-full md:w-110 shrink-0">
          <input
            type="text"
            placeholder={tTable('searchPlaceholder')}
            aria-label={tTable('searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-[#e6e6e6] text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#0a61d7] bg-white"
          />
          <Search className="absolute left-3 top-2 text-gray-400 w-5 h-5" />
        </div>

        {/* Filter Buttons and View Toggle - Right Side */}
        <div className="flex flex-wrap gap-2 w-full md:flex-1 md:min-w-0 md:flex-nowrap items-center justify-end">

          {/* Stock Filter Dropdown */}
          <div className="relative">
            <button
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-100 text-sm whitespace-nowrap"
              onClick={() => {
                setShowStockDropdown(v => !v);
                setShowCategoryDropdown(false);
                setShowFilterDropdown(false);
                setShowProdCategoryDropdown(false);
                setShowOfferDropdown(false);
              }}
            >
              <Filter className="w-4 h-4" />
              {translateStockFilter(selectedStockFilter)}
              <ChevronDown className="w-4 h-4 ml-1 text-gray-500" />
            </button>
            {showStockDropdown && (
              <div className="absolute right-0 mt-2 w-40 bg-white border border-[#e6e6e6] rounded-lg shadow z-20">
                {stockFilters.map((filter) => (
                  <button
                    key={filter.value}
                    onClick={() => {
                      setSelectedStockFilter(filter.value);
                      setShowStockDropdown(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm first:rounded-t-lg last:rounded-b-lg ${
                      selectedStockFilter === filter.value
                        ? 'text-[#0a61d7] font-semibold hover:bg-gray-100'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {translateStockFilter(filter.value)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Type Filter Dropdown */}
          <div className="relative">
            <button
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-100 text-sm whitespace-nowrap"
              onClick={() => {
                setShowCategoryDropdown(v => !v);
                setShowStockDropdown(false);
                setShowFilterDropdown(false);
                setShowProdCategoryDropdown(false);
                setShowOfferDropdown(false);
              }}
            >
              <Filter className="w-4 h-4" />
              {getTypeFilterLabel(selectedCategory)}
              <ChevronDown className="w-4 h-4 ml-1 text-gray-500" />
            </button>
            {showCategoryDropdown && (
              <div className="absolute right-0 mt-2 w-40 bg-white border border-[#e6e6e6] rounded-lg shadow z-20">
                {categoryFilters.map((category) => (
                  <button
                    key={category}
                    onClick={() => {
                      setSelectedCategory(category);
                      setShowCategoryDropdown(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm first:rounded-t-lg last:rounded-b-lg ${
                      selectedCategory === category
                        ? 'text-[#0a61d7] font-semibold hover:bg-gray-100'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {getTypeFilterLabel(category)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product Category Filter Dropdown */}
          <div className="relative">
            <button
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-100 text-sm whitespace-nowrap"
              onClick={() => {
                setShowProdCategoryDropdown(v => !v);
                setShowStockDropdown(false);
                setShowFilterDropdown(false);
                setShowCategoryDropdown(false);
                setShowOfferDropdown(false);
              }}
            >
              <Filter className="w-4 h-4" />
              {getProdCategoryFilterLabel(selectedProdCategory)}
              <ChevronDown className="w-4 h-4 ml-1 text-gray-500" />
            </button>
            {showProdCategoryDropdown && (
              <div className="absolute right-0 mt-2 w-48 bg-white border border-[#e6e6e6] rounded-lg shadow z-20">
                {prodCategoryFilters.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => {
                      setSelectedProdCategory(cat);
                      setShowProdCategoryDropdown(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm first:rounded-t-lg last:rounded-b-lg ${
                      selectedProdCategory === cat
                        ? 'text-[#0a61d7] font-semibold hover:bg-gray-100'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {getProdCategoryFilterLabel(cat)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Offer Filter Dropdown */}
          <div className="relative">
            <button
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-100 text-sm whitespace-nowrap"
              onClick={() => {
                setShowOfferDropdown(v => !v);
                setShowStockDropdown(false);
                setShowFilterDropdown(false);
                setShowCategoryDropdown(false);
                setShowProdCategoryDropdown(false);
              }}
            >
              <Gift className="w-4 h-4" />
              {translateOfferFilter(selectedOfferFilter)}
              <ChevronDown className="w-4 h-4 ml-1 text-gray-500" />
            </button>
            {showOfferDropdown && (
              <div className="absolute right-0 mt-2 w-40 bg-white border border-[#e6e6e6] rounded-lg shadow z-20">
                {offerFilters.map((filter) => (
                  <button
                    key={filter.value}
                    onClick={() => {
                      setSelectedOfferFilter(filter.value);
                      setShowOfferDropdown(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm first:rounded-t-lg last:rounded-b-lg ${
                      selectedOfferFilter === filter.value
                        ? 'text-[#0a61d7] font-semibold hover:bg-gray-100'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {translateOfferFilter(filter.value)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* View Toggle - Desktop Only */}
          <div className="hidden md:flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-md transition-colors ${
                viewMode === 'grid' 
                  ? 'bg-white text-[#0a61d7] shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              title={tTable('gridView')}
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-md transition-colors ${
                viewMode === 'list' 
                  ? 'bg-white text-[#0a61d7] shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              title={tTable('listView')}
            >
              <List className="w-4 h-4" />
            </button>
          </div>

        </div>
      </div>

      {/* Data Completion Indicator */}
      {(() => {
        const currentPageProductIds = pagedProducts.map(p => p.productId);
          const currentPageOriginalProducts = products.filter(p => currentPageProductIds.includes(p.productId));
        
        const missingDataCount = currentPageOriginalProducts.filter(product => {
            // Check if product has at least one complete variant (piece-based system)
          const hasCompleteVariant =
            (product.variantOptions && product.variantOptions.length > 0 &&
              product.variantOptions.some(option =>
                option.purchasePrice &&
                option.sellingPrice &&
                option.isActive
              ));
          
          // Check variant-level stock (piece-based system)
          const variantOptionsStock = product.variantOptions?.reduce((total, option) => ({
            totalStock: total.totalStock + (option.stockQuantity || 0),
            lowStockThreshold: Math.max(total.lowStockThreshold, option.lowStockThreshold || 0)
          }), { totalStock: 0, lowStockThreshold: 0 }) || { totalStock: 0, lowStockThreshold: 0 };
          
          const totalStock = variantOptionsStock.totalStock;
          const hasStock = totalStock >= 0;
          
          // Use the same logic as isProductComplete function
          const hasRequiredFields = Boolean(product.sku && 
                                   product.name && 
                                   product.description && 
                                   product.productType && 
                                   product.brand && 
                                   product.supplier && 
                                   hasCompleteVariant &&
                                   hasStock);
          
          const hasImages = Boolean(product.images && product.images.length > 0);
          
          // Return true if product is NOT complete (missing data)
          return !(hasRequiredFields && hasImages);
        }).length;
        
        return missingDataCount > 0 ? (
          <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-amber-700 text-sm">
              ⚠️ <strong>{tShared('missing.dataCompletion')}</strong>{' '}
              {missingDataCount === 1
                ? tShared('missing.productsIncomplete', { count: missingDataCount })
                : tShared('missing.productsIncompletePlural', { count: missingDataCount })}
            </p>
          </div>
        ) : null;
      })()}

      {/* Bulk Action Bar */}
      {selectedProducts.length > 0 && (
        <div className="bg-white border border-[#e6e6e6] border-l-4 border-l-green-500 rounded-lg p-3 md:p-4 mb-2 shadow-sm">
          {/* Mobile Layout */}
          <div className="md:hidden space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-green-700">
                {selectedProducts.length}{' '}
                {selectedProducts.length === 1
                  ? tTable('selection.oneProductSelected')
                  : tTable('selection.multipleProductsSelected')}
              </span>
            </div>
            <div className="text-gray-600 text-xs font-semibold leading-relaxed">
              {(() => {
                const buttons = { canPublish: false, canUnpublish: false, canRemove: true };
                if (selectedProducts.length > 0) {
                  const selectedProductData = tableRows.filter(product => selectedProducts.includes(String(product.id)));
                  const hasDraft = selectedProductData.some(product => product.status === 'Draft');
                  const hasPublished = selectedProductData.some(product => product.status === 'Published');
                  const hasInactive = selectedProductData.some(product => product.status === 'Inactive');
                  const hasActive = selectedProductData.some(product => product.status === 'Active');

                  buttons.canPublish = hasDraft || hasInactive || hasActive;
                  buttons.canUnpublish = hasPublished;
                  buttons.canRemove = true;
                }
                return getBulkSelectionMessage(buttons);
              })()}
            </div>
            <div className="flex gap-2">
              {(() => {
                const buttons = { canPublish: false, canUnpublish: false, canRemove: true };
                if (selectedProducts.length > 0) {
                  const selectedProductData = tableRows.filter(product => selectedProducts.includes(String(product.id)));
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
                        if (selectedProducts.length === 1) {
                          // Single product - show preview modal
                          const product = tableRows.find(p => selectedProducts.includes(String(p.id)));
                          if (product) {
                            handleOpenPublishModal(product);
                          }
                        } else {
                          // Multiple products - show bulk publish modal with smart filtering
                          setShowPublishModal(true);
                        }
                      }}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white font-semibold text-sm rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <Zap className="w-4 h-4 text-white" />
                      {tTable('bulkActions.publish')}
                    </button>
                  );
                } else if (buttons.canUnpublish && !buttons.canPublish) {
                  // Only published products - show unpublish and remove
                  buttonElements.push(
                    <button
                      key="unpublish"
                      onClick={handleBulkUnpublish}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-orange-600 text-white font-semibold text-sm rounded-lg hover:bg-orange-700 transition-colors"
                    >
                      <EyeOff className="w-4 h-4 text-white" />
                      {tTable('bulkActions.unpublish')}
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
                    {tTable('bulkActions.remove')}
                  </button>
                );
                
                return buttonElements;
              })()}
            </div>
          </div>
          
          {/* Desktop Layout */}
          <div className="hidden md:flex items-center justify-between">
            <span className="text-sm font-semibold text-green-700">
              {selectedProducts.length}{' '}
              {selectedProducts.length === 1
                ? tTable('selection.oneProductSelected')
                : tTable('selection.multipleProductsSelected')}
            </span>
            <div className="flex items-center gap-4">
              <span className="text-gray-600 text-xs md:text-sm font-semibold">
                {(() => {
                  const buttons = { canPublish: false, canUnpublish: false, canRemove: true };
                  if (selectedProducts.length > 0) {
                    const selectedProductData = tableRows.filter(product => selectedProducts.includes(String(product.id)));
                    const hasDraft = selectedProductData.some(product => product.status === 'Draft');
                    const hasPublished = selectedProductData.some(product => product.status === 'Published');
                    const hasInactive = selectedProductData.some(product => product.status === 'Inactive');
                    const hasActive = selectedProductData.some(product => product.status === 'Active');

                    buttons.canPublish = hasDraft || hasInactive || hasActive;
                    buttons.canUnpublish = hasPublished;
                    buttons.canRemove = true;
                  }
                  return getBulkSelectionMessage(buttons, true);
                })()}
              </span>
              <div className="flex gap-2">
                {(() => {
                  const buttons = { canPublish: false, canUnpublish: false, canRemove: true };
                  if (selectedProducts.length > 0) {
                    const selectedProductData = tableRows.filter(product => selectedProducts.includes(String(product.id)));
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
                          if (selectedProducts.length === 1) {
                            // Single product - show preview modal
                            const product = tableRows.find(p => selectedProducts.includes(String(p.id)));
                            if (product) {
                              handleOpenPublishModal(product);
                            }
                          } else {
                            // Multiple products - show bulk publish modal with smart filtering
                            setShowPublishModal(true);
                          }
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white font-semibold text-sm rounded-lg hover:bg-green-700 transition-colors"
                      >
                        <Zap className="w-4 h-4 text-white" />
                        {tTable('bulkActions.publish')}
                      </button>
                    );
                  } else if (buttons.canUnpublish && !buttons.canPublish) {
                    // Only published products - show unpublish and remove
                    buttonElements.push(
                      <button
                        key="unpublish"
                        onClick={handleBulkUnpublish}
                        className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white font-semibold text-sm rounded-lg hover:bg-orange-700 transition-colors"
                      >
                        <EyeOff className="w-4 h-4 text-white" />
                        {tTable('bulkActions.unpublish')}
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
                      {tTable('bulkActions.remove')}
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
        {filteredProducts.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Package className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p className="text-sm">{tTable('noProducts')}</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-100 text-gray-500 whitespace-nowrap">
                 <th className="text-left py-3 px-4 font-medium text-xs uppercase">
                   <button
                     onClick={handleSelectAll}
                     className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                       allFilteredSelected
                         ? 'bg-green-500 border-green-500'
                         : 'bg-white border-gray-300 hover:border-green-400'
                     }`}
                   >
                     {allFilteredSelected && (
                       <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                         <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                       </svg>
                     )}
                   </button>
                 </th>
                 <th className="text-left py-3 px-4 font-medium text-xs uppercase">{tShared('columns.idSku')}</th>
                 <th className="text-left py-3 px-4 font-medium text-xs uppercase">{tShared('columns.productName')}</th>
                 <th className="text-left py-3 px-4 font-medium text-xs uppercase">{tShared('columns.type')}</th>
                 <th className="text-left py-3 px-4 font-medium text-xs uppercase">{tShared('columns.category')}</th>
                 <th className="text-left py-3 px-4 font-medium text-xs uppercase">{tShared('columns.brand')}</th>
                 <th className="text-left py-3 px-4 font-medium text-xs uppercase">{tShared('columns.stock')}</th>
                 <th className="text-left py-3 px-4 font-medium text-xs uppercase">{tShared('columns.sellingPrice')}</th>
                 <th className="text-left py-3 px-4 font-medium text-xs uppercase">{tShared('columns.status')}</th>
                 <th className="text-left py-3 px-4 font-medium text-xs uppercase">{tShared('columns.lastUpdated')}</th>
                 <th className="text-center py-3 px-4 font-medium text-xs uppercase">{tShared('actions')}</th>
              </tr>
            </thead>
            <tbody className="text-xs whitespace-nowrap">
              {pagedProducts.map((product) => {
              // Get the original product data to check for missing data
              const originalProduct = products.find(p => p.productId === product.productId);
              
              const hasIncompleteData = originalProduct ? (() => {
                // Check if product has variants and if the first variant has required data (piece-based system)
                const firstVariantOption = originalProduct.variantOptions?.[0];
                const hasCompleteVariant = Boolean(firstVariantOption?.purchasePrice && firstVariantOption?.sellingPrice);
                
                const hasRequiredFields = Boolean(originalProduct.sku && 
                                         originalProduct.name && 
                                         originalProduct.description && 
                                         originalProduct.productType && 
                                         originalProduct.brand && 
                                         originalProduct.supplier && 
                                         hasCompleteVariant);
                
                // Check variant-level stock (piece-based system)
                const variantOptionsStock = originalProduct.variantOptions?.reduce((total, option) => ({
                  totalStock: total.totalStock + (option.stockQuantity || 0),
                  lowStockThreshold: Math.max(total.lowStockThreshold, option.lowStockThreshold || 0)
                }), { totalStock: 0, lowStockThreshold: 0 }) || { totalStock: 0, lowStockThreshold: 0 };
                
                const totalStock = variantOptionsStock.totalStock;
                const hasStock = totalStock >= 0;
                
                const hasImages = Boolean(originalProduct.images && originalProduct.images.length > 0);
                
                // Return true if product is NOT complete (has incomplete data)
                return !(hasRequiredFields && hasStock && hasImages);
              })() : false;
              
              return (
                <tr 
                  key={product.id} 
                  className={`border-b border-[#e6e6e6] transition cursor-pointer ${
                    selectedProducts.includes(String(product.id)) 
                      ? 'bg-blue-50' 
                      : hasIncompleteData
                      ? 'bg-amber-50' // Highlight incomplete rows with amber background
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
                    <div className="font-medium truncate">
                      {String(product.sku).trim() ? (
                        product.sku
                      ) : (
                        <span className="text-red-600 font-bold">{tShared('missing.sku')}</span>
                      )}
                    </div>
                    <div className="text-gray-500 text-xs truncate">{product.productId}</div>
                  </div>
                </td>
                 <td className="max-w-20 py-3 px-4 text-xs text-gray-900 font-medium truncate">
                   {String(product.name).trim() ? (
                     product.name
                   ) : (
                     <span className="text-red-600 font-bold">{tShared('missing.productName')}</span>
                   )}
                 </td>
                 <td className="truncate py-3 px-4 text-xs text-gray-700">
                  {String(product.productType).trim() ? (
                     translateCategory(product.productType)
                   ) : (
                     <span className="text-red-600 font-bold">{tShared('missing.type')}</span>
                   )}
                 </td>
                 <td className="truncate py-3 px-4 text-xs text-gray-700">
                  {(() => {
                    const originalProduct = products.find(p => p.productId === product.productId);
                    const category = originalProduct?.productCategory;
                    return String(category || '').trim() ? (
                      category
                    ) : (
                      <span className="text-red-600 font-bold">{tShared('missing.category')}</span>
                    );
                  })()}
                 </td>
                 <td className="max-w-20 truncate py-3 px-4 text-xs text-gray-700">
                   {String(product.brand).trim() ? (
                     product.brand
                   ) : (
                     <span className="text-red-600 font-bold">{tShared('missing.brand')}</span>
                   )}
                 </td>
                 <td className="py-3 px-4 text-xs">
                   <div className="flex items-center gap-2">
                     <span className="text-black">
                       {(() => {
                         const productStock = getProductTotalStock(product.variantOptions || []);
                         return productStock.totalStock;
                       })()}
                     </span>
                     {(() => {
                       const productStock = getProductTotalStock(product.variantOptions || []);
                       const totalStock = productStock.totalStock;
                       const totalLowStockThreshold = productStock.lowStockThreshold;
                       
                       if (totalStock === 0) {
                         return (
                           <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-600">
                             {translateStockStatus('out')}
                           </span>
                         );
                       }
                       if (totalLowStockThreshold > 0 && totalStock <= totalLowStockThreshold) {
                         return (
                           <span className="px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-600">
                             {translateStockStatus('low')}
                           </span>
                         );
                       }
                       return null;
                     })()}
                   </div>
                 </td>
                <td className="py-3 px-4 text-xs">
                  <div className="flex flex-col gap-1">
                    {originalProduct?.offerBadge && (
                      <>
                        {originalProduct.offerBadge === 'All Offers' ? (
                          <div className="flex items-center gap-1">
                            {/* Show fixed discount amount if available, otherwise calculate percentage */}
                            <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-red-50 text-red-600 border border-red-200">
                              {getDiscountBadgeLabel(originalProduct) ?? tTable('offers.discount')}
                            </span>
                            {/* Show promotion details if available */}
                            {originalProduct.promotionDetails && (
                              <span className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-purple-50 text-purple-600 border border-purple-200">
                                <Gift className="w-4 h-4" />
                                {getPromotionLabel(originalProduct.promotionDetails.minQuantity, originalProduct.promotionDetails.freeQuantity)}
                              </span>
                            )}
                          </div>
                        ) : originalProduct.offerBadge === 'Discount' ? (
                          <span className="px-2 py-0.5 rounded-md text-xs font-semibold w-fit bg-red-50 text-red-600 border border-red-200">
                            {getDiscountBadgeLabel(originalProduct) ?? tTable('offers.discount')}
                          </span>
                        ) : originalProduct.offerBadge === 'Promotion' ? (
                          <span className="px-2 py-0.5 rounded-md text-xs font-semibold w-fit bg-purple-50 text-purple-600 border border-purple-200">
                            {originalProduct.promotionDetails 
                              ? getPromotionLabel(originalProduct.promotionDetails.minQuantity, originalProduct.promotionDetails.freeQuantity)
                              : tTable('offers.promotion')
                            }
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-xs font-medium w-fit bg-blue-100 text-blue-700">
                            {originalProduct.offerBadge}
                          </span>
                        )}
                      </>
                    )}
                    <div className="flex flex-col gap-1">
                      {/* Show original price with strikethrough if discount is applied */}
                      {(() => {
                        const originalPriceRange = getOriginalPriceRange(originalProduct);
                        if (originalPriceRange) {
                          // Check if any original price is higher than current price
                          const originalPrices: number[] = [];
                          const variantOptions = originalProduct?.variantOptions || [];
                          
                          variantOptions.forEach(option => {
                            if (option.originalSellingPrice && option.originalSellingPrice !== '') {
                              const price = parsePrice(String(option.originalSellingPrice), userCurrency);
                              if (price > 0) originalPrices.push(price);
                            }
                          });
                          
                          // Get current price (min if range, or single price)
                          const currentPriceStr = String(product.sellingPrice);
                          let currentPriceMin = 0;
                          if (currentPriceStr.includes('–') || currentPriceStr.includes('-')) {
                            const parts = currentPriceStr.split(/[–-]/).map(p => parsePrice(p.trim(), userCurrency));
                            currentPriceMin = Math.min(...parts);
                          } else {
                            currentPriceMin = parsePrice(currentPriceStr, userCurrency);
                          }
                          
                          const minOriginalPrice = Math.min(...originalPrices);
                          if (minOriginalPrice > currentPriceMin && minOriginalPrice > 0) {
                            return (
                              <span className="text-xs text-gray-400 line-through">
                                {originalPriceRange}
                              </span>
                            );
                          }
                        }
                        return null;
                      })()}
                      <span className="text-[#0a61d7] font-semibold">
                        {String(product.sellingPrice).trim() && String(product.sellingPrice) !== '0' && String(product.sellingPrice) !== '' ? (
                          product.sellingPrice.includes('–') || product.sellingPrice.includes('-') ? (
                            // Price range - display as is
                            product.sellingPrice
                          ) : (
                            // Single price - display as is (already formatted by profileToTableRow)
                            product.sellingPrice
                          )
                        ) : (
                          <span className="text-red-600 font-bold">{tShared('missing.sellingPrice')}</span>
                        )}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="py-3 px-4 text-xs">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusBadge(product.status)}`}>
                    {translateStatus(String(product.status))}
                  </span>
                </td>
                                    <td className="py-3 px-4 text-xs text-gray-700">{product.lastUpdated || tShared('notAvailable')}</td>
                <td className="py-3 px-4 text-xs text-center">
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => product.status === 'Published' ? handleView(product) : handleEdit(product)}
                      className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-gray-100 transition-colors focus:outline-none"
                      title={product.status === 'Published' ? tTable('viewProduct') : tTable('editProduct')}
                    >
                      <Edit className="w-4 h-4 text-gray-500" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(product);
                      }}
                      className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-red-100 transition-colors focus:outline-none"
                      title={tTable('deleteProduct')}
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </button>
                  </div>
                </td>
              </tr>
                );
            })}
          </tbody>
         </table>
         )}
       </div>
       )}

       {/* Desktop Grid View */}
       {viewMode === 'grid' && (
         <>
           {filteredProducts.length === 0 ? (
             <div className="text-center py-12 text-gray-500">
               <Package className="w-12 h-12 mx-auto mb-4 text-gray-400" />
               <p className="text-sm">{tTable('noProducts')}</p>
             </div>
           ) : (
             <>
               {/* Select All for Grid View */}
               <div className="hidden md:flex items-center gap-2 mb-4">
                 <button
                   onClick={handleSelectAll}
                   className={`w-5 h-5 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                     allFilteredSelected
                       ? 'bg-green-500 border-green-500'
                       : 'bg-white border-gray-300 hover:border-green-400'
                   }`}
                 >
                   {allFilteredSelected && (
                     <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                       <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                     </svg>
                   )}
                 </button>
                 <span className="text-sm font-medium text-gray-700">
                   {tTable('selection.selectAllCount', { count: filteredProducts.length })}
                 </span>
               </div>
               
               <div className="hidden md:grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
               {pagedProducts.map((product) => {
             // Get the original product data to check for missing data and offers
             const originalProduct = products.find(p => p.productId === product.productId);
             
             const hasIncompleteData = originalProduct ? (() => {
               // Check all profile fields for missing data (piece-based system)
                const basicFields = [
                !String(originalProduct.sku).trim(), !String(originalProduct.name).trim(), 
                !String(originalProduct.description).trim(), !String((originalProduct.productType || '')).trim(),
                !String(originalProduct.brand).trim(), !String(originalProduct.supplier).trim()
                ];
               const hasMissingBasicFields = basicFields.some(field => field);
               
               const firstVariantOption = originalProduct.variantOptions?.[0];
               const hasMissingPricing = !(firstVariantOption?.purchasePrice && firstVariantOption?.sellingPrice);
               
               const variantOptionsStock = originalProduct.variantOptions?.reduce((total, option) => ({
                 totalStock: total.totalStock + (option.stockQuantity ?? 0),
                 lowStockThreshold: Math.max(total.lowStockThreshold, option.lowStockThreshold || 0)
               }), { totalStock: 0, lowStockThreshold: 0 }) || { totalStock: 0, lowStockThreshold: 0 };
               
               const hasMissingStock = Boolean(
                 originalProduct.variantOptions?.some(
                   (o) => o.stockQuantity == null || Number.isNaN(o.stockQuantity as unknown as number),
                 ),
               );
               
               return hasMissingBasicFields || hasMissingPricing || hasMissingStock;
             })() : false;
             
             return (
               <div 
                 key={product.id} 
                 className={`rounded-lg border border-[#e6e6e6] p-4 relative cursor-pointer transition ${
                   selectedProducts.includes(String(product.id)) 
                     ? 'bg-blue-50' 
                     : hasIncompleteData
                     ? 'bg-amber-50' // Highlight incomplete cards with amber background
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
               
               {/* Product Image */}
               <div className="w-full h-40 bg-gray-100 rounded-lg mb-3 flex items-center justify-center overflow-hidden relative">
                 {originalProduct && originalProduct.images && originalProduct.images.length > 0 ? (
                   <img 
                     src={originalProduct.images[0]} 
                     alt={product.name || tTable('productImageAlt')}
                     className="w-full h-full object-cover rounded-lg"
                     onError={(e) => {
                       // Fallback to placeholder if image fails to load
                       const target = e.target as HTMLImageElement;
                       target.style.display = 'none';
                       const placeholder = target.nextElementSibling as HTMLElement;
                       if (placeholder) placeholder.style.display = 'flex';
                     }}
                   />
                 ) : null}
                 <div 
                   className="text-gray-400 text-sm items-center justify-center w-full h-full"
                   style={{ display: originalProduct && originalProduct.images && originalProduct.images.length > 0 ? 'none' : 'flex' }}
                 >
                   {tTable('productImage')}
                 </div>
                 {/* Offer Badge on Image */}
                 {originalProduct?.offerBadge && (
                   <div className="absolute top-2 left-2">
                     {originalProduct.offerBadge === 'All Offers' ? (
                       <div className="flex items-center gap-1">
                         {/* Prefer explicit percentage; otherwise show fixed amount or calculated percent */}
                         <span className="px-2 py-0.5 rounded-md text-xs font-semibold shadow-md bg-red-50 text-red-600 border border-red-200">
                           {getDiscountBadgeLabel(originalProduct) ?? tTable('offers.discount')}
                         </span>
                         {/* Show promotion details if available */}
                         {originalProduct.promotionDetails && (
                           <span className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold shadow-md bg-purple-50 text-purple-600 border border-purple-200">
                             <Gift className="w-4 h-4" />
                             {getPromotionLabel(originalProduct.promotionDetails.minQuantity, originalProduct.promotionDetails.freeQuantity)}
                           </span>
                         )}
                       </div>
                     ) : originalProduct.offerBadge === 'Discount' ? (
                       <span className="px-2 py-0.5 rounded-md text-xs font-semibold shadow-md bg-red-50 text-red-600 border border-red-200">
                         {getDiscountBadgeLabel(originalProduct) ?? tTable('offers.discount')}
                       </span>
                     ) : originalProduct.offerBadge === 'Promotion' ? (
                       <span className="px-2 py-0.5 rounded-md text-xs font-semibold shadow-md bg-purple-50 text-purple-600 border border-purple-200">
                         {originalProduct.promotionDetails 
                           ? getPromotionLabel(originalProduct.promotionDetails.minQuantity, originalProduct.promotionDetails.freeQuantity)
                           : tTable('offers.promotion')
                         }
                       </span>
                     ) : (
                       <span className="px-2 py-0.5 rounded text-xs font-semibold shadow-md bg-blue-500 text-white">
                         {originalProduct.offerBadge}
                       </span>
                     )}
                   </div>
                 )}
               </div>
               
               {/* Product Info */}
               <div className="space-y-3">
                 <h3 className="font-medium text-sm text-gray-900 truncate">
                   {String(product.name).trim() ? (
                     product.name
                   ) : (
                     <span className="text-red-600 font-bold">{tShared('missing.productName')}</span>
                   )}
                 </h3>
                 <p className="text-xs text-gray-500">
                   {String(product.productType).trim() ? (
                    translateCategory(product.productType)
                   ) : (
                     <span className="text-red-600 font-bold">{tShared('missing.type')}</span>
                   )}
                 </p>
                 <p className="text-xs text-gray-500">
                   {(() => {
                     const originalProduct = products.find(p => p.productId === product.productId);
                     const category = originalProduct?.productCategory;
                     return String(category || '').trim() ? (
                       category
                     ) : (
                       <span className="text-red-600 font-bold">{tShared('missing.category')}</span>
                     );
                   })()}
                 </p>
                 <p className="text-xs text-gray-500">
                   {String(product.brand).trim() ? (
                     product.brand
                   ) : (
                     <span className="text-red-600 font-bold">{tShared('missing.brand')}</span>
                   )}
                 </p>
                 
                 {/* Stock Status */}
                 <div className="flex items-center gap-2">
                   <span className="text-sm font-medium text-gray-900">
                     {tTable('stockLabel')}{' '}
                     {(() => {
                       const productStock = getProductTotalStock(product.variantOptions || []);
                       return tTable('piecesCount', { count: productStock.totalStock });
                     })()}
                   </span>
                   {(() => {
                     const productStock = getProductTotalStock(product.variantOptions || []);
                     const totalStock = productStock.totalStock;
                     const totalLowStockThreshold = productStock.lowStockThreshold;
                     
                     if (totalStock === 0) {
                       return (
                         <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-600">
                           {translateStockStatus('out')}
                         </span>
                       );
                     }
                     if (totalLowStockThreshold > 0 && totalStock <= totalLowStockThreshold) {
                       return (
                         <span className="px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-600">
                           {translateStockStatus('low')}
                         </span>
                       );
                     }
                     return null;
                   })()}
                 </div>
                 
                 {/* Price */}
                 <div className="flex flex-col gap-1">
                   {/* Show original price with strikethrough if discount is applied */}
                   {(() => {
                     const originalPriceRange = getOriginalPriceRange(originalProduct);
                     if (originalPriceRange) {
                       // Check if any original price is higher than current price
                       const originalPrices: number[] = [];
                       const variantOptions = originalProduct?.variantOptions || [];
                       
                       variantOptions.forEach(option => {
                         if (option.originalSellingPrice && option.originalSellingPrice !== '') {
                           const price = parsePrice(String(option.originalSellingPrice), userCurrency);
                           if (price > 0) originalPrices.push(price);
                         }
                       });
                       
                       // Get current price (min if range, or single price)
                       const currentPriceStr = String(product.sellingPrice);
                       let currentPriceMin = 0;
                       if (currentPriceStr.includes('–') || currentPriceStr.includes('-')) {
                         const parts = currentPriceStr.split(/[–-]/).map(p => parsePrice(p.trim(), userCurrency));
                         currentPriceMin = Math.min(...parts);
                       } else {
                         currentPriceMin = parsePrice(currentPriceStr, userCurrency);
                       }
                       
                       const minOriginalPrice = Math.min(...originalPrices);
                       if (minOriginalPrice > currentPriceMin && minOriginalPrice > 0) {
                         return (
                           <span className="text-xs text-gray-400 line-through">
                             {originalPriceRange}
                           </span>
                         );
                       }
                     }
                     return null;
                   })()}
                   <div className="text-sm font-semibold text-[#0a61d7]">
                     {String(product.sellingPrice).trim() && String(product.sellingPrice) !== '0' && String(product.sellingPrice) !== '' ? (
                       product.sellingPrice.includes('–') || product.sellingPrice.includes('-') ? (
                         // Price range - display as is
                         product.sellingPrice
                       ) : (
                         // Single price - display as is (already formatted by profileToTableRow)
                         product.sellingPrice
                       )
                     ) : (
                       <span className="text-red-600 font-bold">{tShared('missing.sellingPrice')}</span>
                     )}
                   </div>
                 </div>
                 
                 {/* Package Information */}
                 <div className="text-xs text-gray-500 mt-1">
                   <div className="flex items-center gap-1">
                     <span>{tTable('perPackage', { packageType: product.packageType || 'Piece' })}</span>
                     <span className="font-medium text-gray-700">
                       {product.sellingPrice.includes('–') || product.sellingPrice.includes('-') ? (
                         // Price range - display as is
                         product.sellingPrice
                       ) : (
                         // Single price - display as is (already formatted by profileToTableRow)
                         product.sellingPrice
                       )}
                     </span>
                   </div>
                   <div className="text-xs text-gray-400">
                     {tTable('piecesPerPackage', { count: product.piecesPerPackage ?? 1 })}
                   </div>
                 </div>
                 
                 {/* Status Badge */}
                 <div className="flex items-center justify-between">
                   <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusBadge(product.status)}`}>
                     {translateStatus(String(product.status))}
                   </span>
                   
                   {/* Action Buttons */}
                   <div className="flex items-center gap-1">
                     <button
                       onClick={() => product.status === 'Published' ? handleView(product) : handleEdit(product)}
                       className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors focus:outline-none"
                       title={product.status === 'Published' ? tTable('viewProduct') : tTable('editProduct')}
                     >
                       <Edit className="w-4 h-4 text-gray-500" />
                     </button>
                     <button
                       onClick={(e) => {
                         e.stopPropagation();
                         handleDelete(product);
                       }}
                       className="p-1.5 rounded-lg hover:bg-red-100 transition-colors focus:outline-none"
                       title={tTable('deleteProduct')}
                     >
                       <Trash2 className="w-4 h-4 text-red-600" />
                     </button>
                   </div>
                 </div>
               </div>
             </div>
               );
           })}
         </div>
         </>
         )}
         </>
       )}

       {/* Mobile Product Catalog View */}
       <div className="md:hidden">
         {filteredProducts.length === 0 ? (
           <div className="text-center py-12 text-gray-500">
             <Package className="w-12 h-12 mx-auto mb-4 text-gray-400" />
             <p className="text-sm">{tTable('noProducts')}</p>
           </div>
         ) : (
           <>
             {/* Select All for Mobile View */}
             <div className="flex items-center gap-2 mb-3">
               <button
                 onClick={handleSelectAll}
                 className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                   allFilteredSelected
                     ? 'bg-green-500 border-green-500'
                     : 'bg-white border-gray-300 hover:border-green-400'
                 }`}
               >
                 {allFilteredSelected && (
                   <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                     <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                   </svg>
                 )}
               </button>
               <span className="text-sm font-medium text-gray-700">
                 {tTable('selection.selectAllCount', { count: filteredProducts.length })}
               </span>
             </div>
             
             <div className="grid grid-cols-2 gap-3">
               {pagedProducts.map((product) => {
             // Get the original product data to check for missing data
             const originalProduct = products.find(p => p.productId === product.productId);
             
             const hasIncompleteData = originalProduct ? (() => {
               // Check all profile fields for missing data (piece-based system)
               const basicFields = [
                 !String(originalProduct.sku).trim(), !String(originalProduct.name).trim(), 
                !String(originalProduct.description).trim(), !String(originalProduct.productType).trim(),
                 !String(originalProduct.brand).trim(), !String(originalProduct.supplier).trim()
               ];
               const hasMissingBasicFields = basicFields.some(field => field);
               
               const firstVariantOption = originalProduct.variantOptions?.[0];
               const hasMissingPricing = !(firstVariantOption?.purchasePrice && firstVariantOption?.sellingPrice);
               
               const variantOptionsStock = originalProduct.variantOptions?.reduce((total, option) => ({
                 totalStock: total.totalStock + (option.stockQuantity || 0),
                 lowStockThreshold: Math.max(total.lowStockThreshold, option.lowStockThreshold || 0)
               }), { totalStock: 0, lowStockThreshold: 0 }) || { totalStock: 0, lowStockThreshold: 0 };
               
               const totalStock = variantOptionsStock.totalStock;
               const hasMissingStock = totalStock < 0;
               
               return hasMissingBasicFields || hasMissingPricing || hasMissingStock;
             })() : false;
             
             return (
               <div 
                 key={product.id} 
                 className={`rounded-lg border border-[#e6e6e6] p-3 relative cursor-pointer transition ${
                   selectedProducts.includes(String(product.id)) 
                     ? 'bg-blue-50' 
                     : hasIncompleteData
                     ? 'bg-amber-50' // Highlight incomplete cards with amber background
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
               
               {/* Product Image */}
               <div className="w-full h-32 bg-gray-100 rounded-lg mb-3 flex items-center justify-center overflow-hidden relative">
                 {originalProduct && originalProduct.images && originalProduct.images.length > 0 ? (
                   <img 
                     src={originalProduct.images[0]} 
                     alt={product.name || tTable('productImageAlt')}
                     className="w-full h-full object-cover rounded-lg"
                     onError={(e) => {
                       // Fallback to placeholder if image fails to load
                       const target = e.target as HTMLImageElement;
                       target.style.display = 'none';
                       const placeholder = target.nextElementSibling as HTMLElement;
                       if (placeholder) placeholder.style.display = 'flex';
                     }}
                   />
                 ) : null}
                 <div 
                   className="text-gray-400 text-xs items-center justify-center w-full h-full"
                   style={{ display: originalProduct && originalProduct.images && originalProduct.images.length > 0 ? 'none' : 'flex' }}
                 >
                   {tTable('productImage')}
                 </div>
                 {/* Offer Badge on Image */}
                 {originalProduct?.offerBadge && (
                   <div className="absolute top-1 left-1">
                     {originalProduct.offerBadge === 'All Offers' ? (
                       <div className="flex flex-wrap gap-1">
                         {/* Show fixed discount amount if available, otherwise calculate percentage */}
                         <span className="px-2 py-0.5 rounded-md text-xs font-semibold shadow-md bg-red-50 text-red-600 border border-red-200">
                           {getCalculatedDiscountLabel(originalProduct, String(product.sellingPrice))}
                         </span>
                         {/* Show promotion details if available */}
                         {originalProduct.promotionDetails && (
                           <span className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold shadow-md bg-purple-50 text-purple-600 border border-purple-200">
                             <Gift className="w-4 h-4" /> {getPromotionLabel(originalProduct.promotionDetails.minQuantity, originalProduct.promotionDetails.freeQuantity)}
                           </span>
                         )}
                       </div>
                     ) : originalProduct.offerBadge === 'Discount' ? (
                       <span className="px-2 py-0.5 rounded-md text-xs font-semibold shadow-md bg-red-50 text-red-600 border border-red-200">
                         {getCalculatedDiscountLabel(originalProduct, String(product.sellingPrice))}
                       </span>
                     ) : originalProduct.offerBadge === 'Promotion' ? (
                       <span className="px-2 py-0.5 rounded-md text-xs font-semibold shadow-md bg-purple-50 text-purple-600 border border-purple-200">
                         {originalProduct.promotionDetails 
                           ? getPromotionLabel(originalProduct.promotionDetails.minQuantity, originalProduct.promotionDetails.freeQuantity)
                           : tTable('offers.promotion')
                         }
                       </span>
                     ) : (
                       <span className="px-2 py-0.5 rounded text-xs font-semibold shadow-md bg-blue-500 text-white">
                         {originalProduct.offerBadge}
                       </span>
                     )}
                   </div>
                 )}
               </div>
               
               {/* Product Info */}
               <div className="space-y-2">
                 <h3 className="font-medium text-sm text-gray-900 truncate">
                   {String(product.name).trim() ? (
                     product.name
                   ) : (
                     <span className="text-red-600 font-bold">{tShared('missing.productName')}</span>
                   )}
                 </h3>
                 <p className="text-xs text-gray-500">
                  {String(product.productType).trim() ? (
                    translateCategory(product.productType)
                   ) : (
                     <span className="text-red-600 font-bold">{tShared('missing.type')}</span>
                   )}
                 </p>
                 <p className="text-xs text-gray-500">
                   {(() => {
                     const originalProduct = products.find(p => p.productId === product.productId);
                     const category = originalProduct?.productCategory;
                     return String(category || '').trim() ? (
                       category
                     ) : (
                       <span className="text-red-600 font-bold">{tShared('missing.category')}</span>
                     );
                   })()}
                 </p>
                 <p className="text-xs text-gray-500">
                   {String(product.brand).trim() ? (
                     product.brand
                   ) : (
                     <span className="text-red-600 font-bold">{tShared('missing.brand')}</span>
                   )}
                 </p>
                 
                 {/* Stock Status */}
                 <div className="flex items-center gap-2">
                   <span className="text-sm font-medium text-gray-900">
                     {(() => {
                       const productStock = getProductTotalStock(product.variantOptions || []);
                       return productStock.totalStock;
                     })()}
                   </span>
                   {(() => {
                     const productStock = getProductTotalStock(product.variantOptions || []);
                     const totalStock = productStock.totalStock;
                     const totalLowStockThreshold = productStock.lowStockThreshold;
                     
                     if (totalStock === 0) {
                       return (
                         <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-600">
                           {translateStockStatus('out')}
                         </span>
                       );
                     }
                     if (totalLowStockThreshold > 0 && totalStock <= totalLowStockThreshold) {
                       return (
                         <span className="px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-600">
                           {translateStockStatus('low')}
                         </span>
                       );
                     }
                     return null;
                   })()}
                 </div>
                 
                 {/* Price */}
                 <div className="flex flex-col gap-1">
                   {/* Show original price with strikethrough if discount is applied */}
                   {(() => {
                     const originalPriceRange = getOriginalPriceRange(originalProduct);
                     if (originalPriceRange) {
                       // Check if any original price is higher than current price
                       const originalPrices: number[] = [];
                       const variantOptions = originalProduct?.variantOptions || [];
                       variantOptions.forEach(option => {
                         if (option.originalSellingPrice && option.originalSellingPrice !== '') {
                           const price = parsePrice(String(option.originalSellingPrice), userCurrency);
                           if (price > 0) originalPrices.push(price);
                         }
                       });
                       
                       // Get current price (min if range, or single price)
                       const currentPriceStr = String(product.sellingPrice);
                       let currentPriceMin = 0;
                       if (currentPriceStr.includes('–') || currentPriceStr.includes('-')) {
                         const parts = currentPriceStr.split(/[–-]/).map(p => parsePrice(p.trim(), userCurrency));
                         currentPriceMin = Math.min(...parts);
                       } else {
                         currentPriceMin = parsePrice(currentPriceStr, userCurrency);
                       }
                       
                       const minOriginalPrice = Math.min(...originalPrices);
                       if (minOriginalPrice > currentPriceMin && minOriginalPrice > 0) {
                         return (
                           <span className="text-xs text-gray-400 line-through">
                             {originalPriceRange}
                           </span>
                         );
                       }
                     }
                     return null;
                   })()}
                   <div className="text-sm font-semibold text-[#0a61d7]">
                     {String(product.sellingPrice).trim() && String(product.sellingPrice) !== '0' && String(product.sellingPrice) !== '' ? (
                       product.sellingPrice.includes('–') || product.sellingPrice.includes('-') ? (
                         // Price range - display as is
                         product.sellingPrice
                       ) : (
                         // Single price - display as is (already formatted by profileToTableRow)
                         product.sellingPrice
                       )
                     ) : (
                       <span className="text-red-600 font-bold">{tShared('missing.sellingPrice')}</span>
                     )}
                   </div>
                 </div>
                 
                 {/* Package Information */}
                 <div className="text-xs text-gray-500 mt-1">
                   <div className="flex items-center gap-1">
                     <span>{tTable('perPackage', { packageType: product.packageType || 'Piece' })}</span>
                     <span className="font-medium text-gray-700">
                       {product.sellingPrice.includes('–') || product.sellingPrice.includes('-') ? (
                         // Price range - display as is
                         product.sellingPrice
                       ) : (
                         // Single price - display as is (already formatted by profileToTableRow)
                         product.sellingPrice
                       )}
                     </span>
                   </div>
                   <div className="text-xs text-gray-400">
                     {tTable('piecesPerPackage', { count: product.piecesPerPackage ?? 1 })}
                   </div>
                 </div>
                 
                 {/* Status Badge */}
                 <div className="flex items-center justify-between">
                   <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusBadge(product.status)}`}>
                     {translateStatus(String(product.status))}
                   </span>
                   
                   {/* Action Buttons */}
                   <div className="flex items-center gap-1">
                     <button
                       onClick={() => product.status === 'Published' ? handleView(product) : handleEdit(product)}
                       className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors focus:outline-none"
                       title={product.status === 'Published' ? tTable('viewProduct') : tTable('editProduct')}
                     >
                       <Edit className="w-4 h-4 text-gray-500" />
                     </button>
                     <button
                       onClick={(e) => {
                         e.stopPropagation();
                         handleDelete(product);
                       }}
                       className="p-1.5 rounded-lg hover:bg-red-100 transition-colors focus:outline-none"
                       title={tTable('deleteProduct')}
                     >
                       <Trash2 className="w-4 h-4 text-red-600" />
                     </button>
                   </div>
                 </div>
               </div>
             </div>
               );
             })}
           </div>
           </>
         )}
       </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4">
        <div className="text-sm text-gray-500">
          {tShared('pagination.showing', { from: fromRow, to: toRow, total: totalRows })}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            aria-label={tShared('previousPage')}
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
            aria-label={tShared('nextPage')}
            className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg border border-[#e6e6e6] p-4 w-full max-w-sm">
            <h2 className="text-lg font-bold mb-2 text-red-500">
              {isBulkDelete ? tShared('deleteModal.titleBulkProducts') : tShared('deleteModal.titleSingle')}
            </h2>

            {deleteError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <span className="text-red-700 text-sm">{deleteError}</span>
              </div>
            )}

            <p className="mb-4 text-gray-500">
              {isBulkDelete
                ? tShared('deleteModal.confirmBulkProductsCount', { count: selectedProducts.length })
                : tShared('deleteModal.confirmSingleProduct')}
            </p>
            <p className="mb-4 text-xs text-orange-600 bg-orange-50 p-2 rounded">
              {isBulkDelete ? tShared('deleteModal.noteBulkProducts') : tShared('deleteModal.noteSingleProduct')}
            </p>
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
                onClick={handleDeleteCancel}
                disabled={isDeleting}
              >
                {tShared('cancel')}
              </button>
              <button
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 flex items-center gap-2 disabled:opacity-50"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {tShared('deleting')}
                  </>
                ) : (
                  tShared('deleteModal.deleteButton')
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unpublish Confirmation Modal */}
      {showUnpublishModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg border border-[#e6e6e6] p-4 w-full max-w-sm">
            <h2 className="text-lg font-bold mb-2 text-orange-500">
              {isBulkUnpublish ? tShared('unpublishModal.titleBulkProducts') : tShared('unpublishModal.titleSingle')}
            </h2>
            <p className="mb-4 text-gray-500">
              {isBulkUnpublish
                ? tShared('unpublishModal.confirmBulkProductsCount', { count: selectedProducts.length })
                : tShared('unpublishModal.confirmSingleProduct')}
            </p>
            {isBulkUnpublish && (
              <p className="mb-4 text-xs text-orange-600 bg-orange-50 p-2 rounded">
                {tShared('unpublishModal.noteBulkProducts')}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300"
                onClick={handleUnpublishCancel}
                disabled={isUnpublishing}
              >
                {tShared('cancel')}
              </button>
              <button
                className="px-4 py-2 rounded-lg bg-orange-600 text-white hover:bg-orange-700 flex items-center gap-2 disabled:opacity-50"
                onClick={handleUnpublishProducts}
                disabled={isUnpublishing}
              >
                {isUnpublishing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {tShared('unpublishing')}
                  </>
                ) : (
                  tTable('bulkActions.unpublish')
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Marketplace Publication Preview Modal */}
      {showPublishModal && (
        <ProductMarketplacePubs
          product={productToPublish!}
          isOpen={showPublishModal}
          onClose={() => {
            setShowPublishModal(false);
            setProductToPublish(null);
          }}
          onPublish={handlePublishProduct}
          isBulkPublish={!productToPublish || selectedProducts.length > 1}
          selectedCount={productToPublish ? 1 : selectedProducts.length}
          selectedProducts={selectedProducts.map(id => tableRows.find(p => String(p.id) === id)).filter(Boolean) as ProductTableRow[]}
          allProducts={products}
          isProductComplete={isProductComplete}
        />
      )}
    </div>
  );
}

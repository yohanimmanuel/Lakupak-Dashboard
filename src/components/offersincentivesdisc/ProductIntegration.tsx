'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Package, Search, Filter, Plus, Check, X, Target, Tag, Grid, List, ChevronDown, ChevronLeft, ChevronRight, Calendar, ChevronUp } from 'lucide-react';
import { formatCurrency, getDefaultCurrency, parsePrice } from '@/utils/currencyUtils';
import { parseNumberByCurrency } from '@/config/currencyConfig';
import { useUserStore } from '@/store/userStore';
import { Product } from '@/types/product';
import { SelectedProduct, useOfferCreationStore } from '@/store/offerCreationStore';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useOffersTranslations } from '@/hooks/useOffersTranslations';

interface DiscountType {
  id: string;
  name?: string | null | undefined;
  description?: string | null | undefined;
  discountType: 'percentage' | 'fixed' | 'buy_x_get_y';
  discountValue: number;
  minOrderValue?: number | string | null | undefined;
  minQuantity?: number | null | undefined;
  freeQuantity?: number | null | undefined;
  isActive: boolean;
  priority: number;
  offerId?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface DateRange {
  id: string;
  name: string;
  description?: string | null | undefined;
  startDate: Date | string;
  endDate: Date | string;
  isActive: boolean;
  offerCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

interface OfferProduct {
  id: string;
  productId: string;
  name?: string;
  productType?: string;
  productCategory?: string;
  sellingPrice?: string | number;
}

interface OfferData {
  id: string;
  offerId: string;
  name: string;
  description?: string;
  type: string | string[];
  status: string;
  discountTypes: DiscountType[];
  dateRanges?: DateRange[];
  products: OfferProduct[];
  [key: string]: unknown;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  productOfferBadges?: Record<string, string>;
}

interface ProductIntegrationProps {
  isNewOffer?: boolean;
  offerData?: OfferData;
  onOfferChange?: (updatedData: Partial<OfferData>) => void;
  onAddProduct: (product: SelectedProduct) => void;
  onRemoveProduct: (productId: string) => void;
  onUpdateProductDiscount: (productId: string, discountType: 'percentage' | 'fixed', discountValue: number) => void;
}

interface ProductWithOffer extends Product {
  hasOffer?: boolean;
  offerDiscount?: number;
  offerType?: 'percentage' | 'fixed';
  offerBadge?: 'Discount' | 'Promotion' | 'All Offers' | 'Offer';
  isInCurrentOffer?: boolean; // Flag to track if product is in the current offer being edited
}

export default function ProductIntegration({ 
  isNewOffer = false, 
  offerData,
  onOfferChange,
  onAddProduct, 
  onRemoveProduct, 
  onUpdateProductDiscount 
}: ProductIntegrationProps) {
  const {
    tProducts,
    tShared,
    tTable,
    translateFilter,
    translateDiscountType,
    translateOfferBadge,
    translateRecordStatus,
    translateStockStatus,
  } = useOffersTranslations();
  const user = useUserStore(state => state.user);
  const userCurrency = user?.currency || getDefaultCurrency();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('All Types');
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [selectedBrand, setSelectedBrand] = useState('All Brands');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  const [products, setProducts] = useState<ProductWithOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [forceRender, setForceRender] = useState(0);
  const rowsPerPage = 8;
  
  // Pagination configuration for fetching all records
  const FETCH_PAGE_LIMIT = 100;
  
  // Ranges and configured offer types come from centralized offer creation store
  const store = useOfferCreationStore();
  const { dateRanges: storeDateRanges, discountTypes: storeDiscountTypes, productOfferBadges: storeProductOfferBadges, setProductOfferBadge, clearProductOfferBadge } = store;
  
  // Use offerData if provided (details view), otherwise use store data (create view)
  const dateRanges = offerData?.dateRanges || storeDateRanges;
  const discountTypes = offerData?.discountTypes || storeDiscountTypes;
  const productOfferBadges = offerData?.productOfferBadges || storeProductOfferBadges;
  const isDetailsView = Boolean(offerData); // Flag to determine if we're in details view
  const isBatchEditMode = Boolean(offerData && onOfferChange);
  
  // Modal states
  const [showMoreOfferTypes, setShowMoreOfferTypes] = useState(false);
  const [showMoreRanges, setShowMoreRanges] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  
  // Selection states for flexible offer/period application
  const [selectedOfferTypes, setSelectedOfferTypes] = useState<string[]>([]);
  const [selectedDateRanges, setSelectedDateRanges] = useState<string[]>([]);

  const getFilterLabel = (filter: string) =>
    filter === 'All Types' || filter === 'All Categories' || filter === 'All Brands'
      ? translateFilter(filter)
      : filter;

  const getTypeLabel = (t: 'percentage' | 'fixed' | 'buy_x_get_y') => translateDiscountType(t);

  const offerTypes = (discountTypes || []).map((dt) => ({
    id: dt.id,
    name: dt.name && dt.name.trim().length > 0 ? dt.name : getTypeLabel(dt.discountType),
    type: dt.discountType,
  }));

  // Handlers for toggling selections
  const toggleOfferType = (discountType: string) => {
    setSelectedOfferTypes(prev =>
      prev.includes(discountType)
        ? prev.filter(type => type !== discountType)
        : [...prev, discountType]
    );
  };

  const toggleDateRange = (rangeId: string) => {
    setSelectedDateRanges(prev =>
      prev.includes(rangeId)
        ? prev.filter(id => id !== rangeId)
        : [...prev, rangeId]
    );
  };

  const selectAllOfferTypes = () => {
    if (selectedOfferTypes.length === offerTypes.length) {
      setSelectedOfferTypes([]);
    } else {
      setSelectedOfferTypes(offerTypes.map((ot) => ot.type));
    }
  };

  const selectAllDateRanges = () => {
    if (selectedDateRanges.length === dateRanges.length) {
      setSelectedDateRanges([]);
    } else {
      setSelectedDateRanges(dateRanges.map((dr) => dr.id));
    }
  };

  // Determine badge label to apply to selected products
  const computeOfferBadge = (): string => {
    // Use selectedOfferTypes if available (when user is actively selecting)
    const typesToCheck = selectedOfferTypes.length > 0 
      ? selectedOfferTypes 
      : (discountTypes || []).filter((dt) => dt.isActive !== false).map((dt) => dt.discountType);
    
    const hasDiscount = typesToCheck.some((type: string) => type === 'percentage' || type === 'fixed');
    const hasPromotion = typesToCheck.some((type: string) => type === 'buy_x_get_y');
    const hasFreeShipping = typesToCheck.some((type: string) => type === 'free_shipping');
    
    if ((hasDiscount || hasFreeShipping) && hasPromotion) return 'All Offers';
    if (hasPromotion) return 'Promotion';
    if (hasDiscount || hasFreeShipping) return 'Discount';
    return 'Offer';
  };

  // Calculate discount amount for a product based on configured discount types
  const calculateDiscountAmount = (product: ProductWithOffer): number => {
    if (!discountTypes || discountTypes.length === 0) return 0;
    
    const firstVariantOption = product.variantOptions?.[0];
    const productPrice = parseNumberByCurrency(
      String(firstVariantOption?.sellingPrice || '0'), 
      userCurrency
    );
    let totalDiscount = 0;
    
    // Filter discount types based on selected offer types (if any are selected)
    const typesToApply = selectedOfferTypes.length > 0 
      ? discountTypes.filter((dt) => selectedOfferTypes.includes(dt.discountType))
      : discountTypes;
    
    typesToApply.forEach((dt) => {
      if (dt.discountType === 'percentage') {
        totalDiscount += (productPrice * dt.discountValue) / 100;
      } else if (dt.discountType === 'fixed') {
        totalDiscount += dt.discountValue;
      }
      // buy_x_get_y and free_shipping don't affect individual product discount calculation
    });
    
    return totalDiscount;
  };

  // Track products that are currently part of the offer being edited
  // This can be modified by user actions, so it needs to be state
  const [currentOfferProductIds, setCurrentOfferProductIds] = useState<Set<string>>(
    new Set(offerData?.products?.map(p => p.productId) || [])
  );
  
  // Track previous offer ID to only sync when editing a different offer
  const prevOfferIdRef = useRef<string | undefined>(offerData?.id);

  useEffect(() => {
    let ignore = false;
    
    const loadProducts = async () => {
      if (!user?.id) {
        if (!ignore) {
          setProducts([]);
          setLoading(false);
        }
        return;
      }
      
      try {
        if (!ignore) {
          setLoading(true);
        }
        
        // GraphQL queries for products and offers
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
                totalCount
              }
            }
          }
        `;

        const OFFERS_QUERY = `
          query GetOffers($userId: Int!, $page: Int, $limit: Int) {
            offers(userId: $userId, page: $page, limit: $limit) {
              nodes {
                id
                offerId
                name
                status
                type
                discountTypes {
                  id
                  discountType
                  discountValue
                  minQuantity
                  isActive
                  priority
                }
                products {
                  productId
                }
              }
              pagination {
                totalCount
              }
            }
          }
        `;
        
        // Helper function to fetch all pages of products
        const fetchAllProducts = async (): Promise<Product[]> => {
          const allProducts: Product[] = [];
          let currentPage = 1;
          let totalCount = 0;
          
          while (true) {
            const response = await fetchGraphQL<{
              products: {
                nodes: Product[];
                pagination: { totalCount: number };
              };
            }>(PRODUCTS_QUERY, {
              userId: user.id,
              page: currentPage,
              limit: FETCH_PAGE_LIMIT,
            });
            
            if (ignore) return [];
            
            const nodes = response.products.nodes;
            totalCount = response.products.pagination.totalCount;
            allProducts.push(...nodes);
            
            // Stop if we've fetched all records or no more nodes
            if (nodes.length === 0 || allProducts.length >= totalCount) {
              break;
            }
            
            currentPage++;
          }
          
          // Warn if we didn't fetch all records
          if (allProducts.length < totalCount) {
            console.warn(
              `ProductIntegration: Only fetched ${allProducts.length} of ${totalCount} products. ` +
              `Some products may be missing from the display.`
            );
          }
          
          return allProducts;
        };
        
        // Helper function to fetch all pages of offers
        const fetchAllOffers = async (): Promise<Array<{
          id: string;
          offerId: string;
          name: string;
          status: string;
          type: string[];
          discountTypes: Array<{
            id: string;
            discountType: string;
            discountValue: number;
            minQuantity: number | null;
            isActive: boolean;
            priority: number;
          }>;
          products: Array<{
            productId: string;
          }>;
        }>> => {
          const allOffers: Array<{
            id: string;
            offerId: string;
            name: string;
            status: string;
            type: string[];
            discountTypes: Array<{
              id: string;
              discountType: string;
              discountValue: number;
              minQuantity: number | null;
              isActive: boolean;
              priority: number;
            }>;
            products: Array<{
              productId: string;
            }>;
          }> = [];
          let currentPage = 1;
          let totalCount = 0;
          
          while (true) {
            const response = await fetchGraphQL<{
              offers: {
                nodes: Array<{
                  id: string;
                  offerId: string;
                  name: string;
                  status: string;
                  type: string[];
                  discountTypes: Array<{
                    id: string;
                    discountType: string;
                    discountValue: number;
                    minQuantity: number | null;
                    isActive: boolean;
                    priority: number;
                  }>;
                  products: Array<{
                    productId: string;
                  }>;
                }>;
                pagination: { totalCount: number };
              };
            }>(OFFERS_QUERY, {
              userId: user.id,
              page: currentPage,
              limit: FETCH_PAGE_LIMIT,
            });
            
            if (ignore) return [];
            
            const nodes = response.offers.nodes;
            totalCount = response.offers.pagination.totalCount;
            allOffers.push(...nodes);
            
            // Stop if we've fetched all records or no more nodes
            if (nodes.length === 0 || allOffers.length >= totalCount) {
              break;
            }
            
            currentPage++;
          }
          
          // Warn if we didn't fetch all records
          if (allOffers.length < totalCount) {
            console.warn(
              `ProductIntegration: Only fetched ${allOffers.length} of ${totalCount} offers. ` +
              `Some offers may be missing from the display.`
            );
          }
          
          return allOffers;
        };
        
        // Fetch products and offers in parallel with pagination
        const [products, offers] = await Promise.all([
          fetchAllProducts(),
          fetchAllOffers(),
        ]);
        
        if (ignore) return;
          
        // Get all product IDs that already belong to any offer (active or inactive)
        // Exclude products from the CURRENT offer being edited (if in edit mode)
        const currentOfferId = offerData?.offerId;
        const productsWithOffers = new Set<string>();
      
        // Build productsWithOffers set by checking all offers and their products
        // This ensures we correctly identify products in OTHER offers (not the current one)
        offers.forEach((offer: { id: string; offerId: string; products?: Array<{ productId: string }> }) => {
          // Skip the current offer being edited
          if (offer.offerId === currentOfferId) {
            return;
          }
          // Add all products from this offer to the set
          if (offer.products && Array.isArray(offer.products)) {
            offer.products.forEach((op: { productId: string }) => {
              productsWithOffers.add(op.productId);
            });
          }
        });
        
        if (ignore) return;
        
        // Transform products to include offer information
        const productsWithOfferInfo: ProductWithOffer[] = products.map((product: Product) => {
          const storeHasOffer = Boolean(productOfferBadges[product.productId]);
          const apiHasOffer = productsWithOffers.has(product.productId);
          
          // Check if product is in current offer (for editing mode)
          const isInCurrentOffer = currentOfferProductIds.has(product.productId);
          
          // Determine hasOffer based on whether product is in current offer or not:
          // - If in current offer: hasOffer should be false (so it's NOT blocked) - we only care about offers from OTHER offers
          // - If not in current offer: use API data to check if it has offers from other offers
          // This way, products in the current offer can always be selected/removed
          const hasOffer = isInCurrentOffer ? false : apiHasOffer;
          const productBadge = storeHasOffer ? productOfferBadges[product.productId] : undefined;
        
          // Determine badge: show badge if product is in current offer OR has offer from store
          // If in current offer but no badge from store, show 'Offer' badge
          let finalBadge: 'Discount' | 'Promotion' | 'All Offers' | 'Offer' | undefined;
          if (isInCurrentOffer) {
            finalBadge = (productBadge || 'Offer') as 'Discount' | 'Promotion' | 'All Offers' | 'Offer';
          } else if (storeHasOffer) {
            finalBadge = productBadge as 'Discount' | 'Promotion' | 'All Offers' | 'Offer';
          } else {
            finalBadge = undefined;
          }
            
          return {
            ...product,
            hasOffer, // Only true if product has offers from OTHER offers (not current offer)
            offerDiscount: (isInCurrentOffer && storeHasOffer) ? calculateDiscountAmount(product as ProductWithOffer) : 0,
            offerType: (isInCurrentOffer && storeHasOffer) ? 'percentage' : undefined,
            offerBadge: finalBadge,
            isInCurrentOffer, // Add flag to track if product is in current offer
          };
        });
        
        if (!ignore) {
          setProducts(productsWithOfferInfo);
        }
      } catch (error) {
        if (!ignore) {
          setProducts([]);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };
    
    loadProducts();
    
    return () => {
      ignore = true;
    };
  }, [user?.id, productOfferBadges, currentOfferProductIds, offerData?.offerId]);

  // Transform products with offer data - computed during render instead of useEffect
  // This replaces the useEffect that was transforming products based on offerData props
  const displayProducts = useMemo(() => {
    if (!offerData?.productOfferBadges) return products;
    
    return products.map((p) => {
      const hasOfferFromParent = Boolean(offerData.productOfferBadges![p.productId]);
      const isInCurrentOffer = Boolean(offerData.products?.find(op => op.productId === p.productId));
      
      // Update hasOffer based on parent state
      // If product is in current offer, set hasOffer to false so it's NOT blocked
      // Only set hasOffer to true if product has offers from OTHER offers (not current offer)
      const badge = offerData.productOfferBadges![p.productId] || (isInCurrentOffer ? 'Offer' : undefined);
      return {
        ...p,
        hasOffer: isInCurrentOffer ? false : p.hasOffer, // Keep existing hasOffer if not in current offer, set to false if in current offer
        offerBadge: badge as 'Discount' | 'Promotion' | 'All Offers' | 'Offer' | undefined,
        isInCurrentOffer, // Add flag to track if product is in current offer
      };
    });
  }, [products, offerData?.productOfferBadges, offerData?.products]);

  // Memoize filter options to avoid recalculating on every render
  const productTypes = useMemo(() => 
    ['All Types', ...Array.from(new Set(displayProducts.map(p => p.productType).filter(Boolean)))],
    [displayProducts]
  );
  
  const productCategories = useMemo(() => 
    ['All Categories', ...Array.from(new Set(displayProducts.map(p => p.productCategory).filter(Boolean)))],
    [displayProducts]
  );
  
  const brands = useMemo(() => 
    ['All Brands', ...Array.from(new Set(displayProducts.map(p => p.brand).filter(Boolean)))],
    [displayProducts]
  );

  // Memoize filtered products to avoid recalculating on every render
  const filteredProducts = useMemo(() => {
    return displayProducts.filter(product => {
      const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           product.productType.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           product.productCategory.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           product.brand.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = selectedType === 'All Types' || product.productType === selectedType;
      const matchesCategory = selectedCategory === 'All Categories' || product.productCategory === selectedCategory;
      const matchesBrand = selectedBrand === 'All Brands' || product.brand === selectedBrand;
      
      return matchesSearch && matchesType && matchesCategory && matchesBrand;
    });
  }, [displayProducts, searchTerm, selectedType, selectedCategory, selectedBrand]);

  // Memoize pagination calculations
  const totalRows = useMemo(() => filteredProducts.length, [filteredProducts]);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalRows / rowsPerPage)), [totalRows, rowsPerPage]);
  const pagedProducts = useMemo(() => 
    filteredProducts.slice((page - 1) * rowsPerPage, page * rowsPerPage),
    [filteredProducts, page, rowsPerPage]
  );
  const fromRow = useMemo(() => totalRows === 0 ? 0 : (page - 1) * rowsPerPage + 1, [totalRows, page, rowsPerPage]);
  const toRow = useMemo(() => Math.min(page * rowsPerPage, totalRows), [page, rowsPerPage, totalRows]);

  // Handlers that reset page when filters change (better than useEffect)
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setPage(1);
  };

  const handleTypeChange = (type: string) => {
    setSelectedType(type);
    setPage(1);
  };

  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    setPage(1);
  };

  const handleBrandChange = (brand: string) => {
    setSelectedBrand(brand);
    setPage(1);
  };

  // Determine if we're editing an existing offer
  const isEditingOffer = Boolean(offerData?.id);

  // Sync currentOfferProductIds when offerData.id changes (switching to different offer)
  // This is acceptable because the state can also be modified by user actions
  // Only depend on offerData?.id to avoid re-running when products array reference changes
  // The products will be synced when the offer ID actually changes
  useEffect(() => {
    const currentOfferId = offerData?.id;
    if (currentOfferId !== prevOfferIdRef.current) {
      prevOfferIdRef.current = currentOfferId;
      // Reset to products from the new offer
      setCurrentOfferProductIds(new Set(offerData?.products?.map(p => p.productId) || []));
    }
  }, [offerData?.id]); // Removed offerData?.products - array reference changes don't indicate actual change

  
  // Check if product can be selected
  const canSelectProduct = (productId: string) => {
    const product = displayProducts.find(p => p.productId === productId);
    if (!product) return false;
    
    // If product has an offer from a DIFFERENT offer, it cannot be selected
    const hasOfferFromOtherOffers = product.hasOffer && !currentOfferProductIds.has(productId);
    return !hasOfferFromOtherOffers;
  };

  // Helper function to check if product should show as disabled in UI
  const shouldShowAsDisabled = (productId: string) => {
    const product = displayProducts.find(p => p.productId === productId);
    if (!product) return false;
    
    // Check if product has offers from OTHER offers (not the current offer being edited)
    // If product is in current offer, it should NOT be disabled
    // If product has offers from API but is NOT in current offer, it should be disabled
    const hasOfferFromOtherOffers = product.hasOffer && !currentOfferProductIds.has(productId);
    
    // Only show as disabled if product has offers from OTHER offers (not current offer)
    return hasOfferFromOtherOffers;
  };

  const handleProductSelect = (productId: string) => {
    // Check if product can be selected
    if (!canSelectProduct(productId)) {
      return;
    }
    
    setSelectedProducts(prev => {
      if (prev.includes(productId)) {
        // Deselect the product
        return prev.filter(id => id !== productId);
      } else {
        // Add the product to selection
        return [...prev, productId];
      }
    });
  };

  // Handle removing a product from the current offer
  const handleRemoveFromOffer = (productId: string) => {
    if (!currentOfferProductIds.has(productId)) {
      return; // Product is not in current offer
    }

    if (isBatchEditMode && offerData) {
      // In batch edit mode, update parent state
      const existingProducts = offerData.products || [];
      const updatedProducts = existingProducts.filter((p) => p.productId !== productId);
      
      // Update product offer badges
      const updatedBadges = { ...productOfferBadges };
      delete updatedBadges[productId];
      
      onOfferChange!({ 
        products: updatedProducts,
        productOfferBadges: updatedBadges
      });
      
      // Update local UI - only remove the offer badge, keep hasOffer as is
      // Don't change hasOffer globally as product might have offers from other offers
      setProducts((prev) => prev.map((p) => 
        p.productId === productId
          ? { 
              ...p, 
              offerBadge: undefined,
              // Keep hasOffer as is - don't change it globally
              // Only remove the offer badge for this specific offer
            }
          : p
      ));
      
      // Update currentOfferProductIds to remove the product
      setCurrentOfferProductIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(productId);
        return newSet;
      });
    } else {
      // In create view, update local state - only remove the offer badge
      // Don't change hasOffer globally as product might have offers from other offers
      setProducts((prev) => prev.map((p) => 
        p.productId === productId
          ? { 
              ...p, 
              offerBadge: undefined,
              // Keep hasOffer as is - don't change it globally
              // Only remove the offer badge for this specific offer
            }
          : p
      ));
      clearProductOfferBadge(productId);
      
      // Update currentOfferProductIds to remove the product
      setCurrentOfferProductIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(productId);
        return newSet;
      });
    }
  };

  const handleRowClick = (productId: string, event: React.MouseEvent) => {
    if ((event.target as HTMLElement).closest('button') || (event.target as HTMLElement).closest('th')) {
      return;
    }
    handleProductSelect(productId);
  };

  const handleSelectAll = () => {
    const availableProducts = pagedProducts.filter(p => canSelectProduct(p.productId));
    if (selectedProducts.length === availableProducts.length && availableProducts.length > 0) {
      // Deselect all
      setSelectedProducts([]);
    } else {
      // Select all available products on current page
      const availableProductIds = availableProducts.map(product => product.productId);
      setSelectedProducts(availableProductIds);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'published':
        return 'bg-green-100 text-green-800 border border-green-200';
      case 'draft':
        return 'bg-gray-100 text-gray-800 border border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border border-gray-200';
    }
  };

  // Calculate price range for display
  const getPriceDisplay = (product: ProductWithOffer): string => {
    const variantOptions = product.variantOptions || [];
    
    // Collect all prices from variantOptions
    const prices: number[] = [];
    
    // Add prices from variantOptions
    variantOptions.forEach(option => {
      const price = parsePrice(String(option.sellingPrice), userCurrency);
      if (price > 0) {
        prices.push(price);
      }
    });
    
    if (prices.length === 0) {
      return formatCurrency(0, userCurrency);
    }
    
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    
    if (minPrice === maxPrice) {
      return formatCurrency(minPrice, userCurrency);
    } else {
      return `${formatCurrency(minPrice, userCurrency)} – ${formatCurrency(maxPrice, userCurrency)}`;
    }
  };

  const getStockStatus = (product: ProductWithOffer) => {
    // Calculate total stock from variantOptions
    const variantOptionsStock = product.variantOptions?.reduce((sum, vo) => sum + (vo.stockQuantity || 0), 0) || 0;
    const totalStock = variantOptionsStock;
    
    const variantOptionsThreshold = product.variantOptions?.reduce((sum, vo) => sum + (vo.lowStockThreshold || 0), 0) || 0;
    const totalLowStockThreshold = variantOptionsThreshold;
    
    if (totalStock === 0) return { color: 'text-red-600', bg: 'bg-red-50', label: 'Out of Stock' };
    if (totalLowStockThreshold > 0 && totalStock <= totalLowStockThreshold) return { color: 'text-orange-600', bg: 'bg-orange-50', label: 'Low Stock' };
    return { color: 'text-green-600', bg: 'bg-green-50', label: 'In Stock' };
  };

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-[#0a61d7] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">{tProducts('loading')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-black">
            {isNewOffer ? tProducts('titleNew') : tProducts('titleEdit')}
          </h2>
        </div>
        {selectedProducts.length > 0 && (
          <button
            onClick={() => setShowOfferModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0a61d7] text-white font-semibold hover:bg-[#084ba6] transition text-sm"
          >
            <Plus className="w-4 h-4" />
            {tProducts('applyOffer', { count: selectedProducts.length })}
          </button>
        )}
      </div>

      {/* Filters and Search */}
      <div className="bg-white">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Search */}
          <div className="flex gap-2 w-full md:w-auto items-center">
            <div className="relative w-full md:w-64 shrink-0">
              <input
                type="text"
                placeholder={tProducts('searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-[#e6e6e6] text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#0a61d7] bg-white"
              />
              <Search className="absolute left-3 top-2 text-gray-400 w-5 h-5" />
            </div>

            {/* Product Type Filter Dropdown */}
            <div className="relative">
              <button
                className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-100 text-sm"
                onClick={() => {
                  setShowTypeDropdown(!showTypeDropdown);
                  setShowCategoryDropdown(false);
                  setShowBrandDropdown(false); // Close other dropdowns when opening type dropdown
                }}
              >
                {getFilterLabel(selectedType)}
                <ChevronDown className="w-4 h-4 ml-1 text-gray-500" />
              </button>
              {showTypeDropdown && (
                <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow z-20">
                  {productTypes.map((type) => (
                    <button
                      key={type}
                      onClick={() => {
                        handleTypeChange(type);
                        setShowTypeDropdown(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-sm first:rounded-t-lg last:rounded-b-lg ${
                        selectedType === type
                          ? 'text-[#0a61d7] font-semibold hover:bg-gray-100'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {getFilterLabel(type)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Product Category Filter Dropdown */}
            <div className="relative">
              <button
                className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-100 text-sm"
                onClick={() => {
                  setShowCategoryDropdown(!showCategoryDropdown);
                  setShowTypeDropdown(false);
                  setShowBrandDropdown(false); // Close other dropdowns when opening category dropdown
                }}
              >
                {getFilterLabel(selectedCategory)}
                <ChevronDown className="w-4 h-4 ml-1 text-gray-500" />
              </button>
              {showCategoryDropdown && (
                <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow z-20">
                  {productCategories.map((category) => (
                    <button
                      key={category}
                      onClick={() => {
                        handleCategoryChange(category);
                        setShowCategoryDropdown(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-sm first:rounded-t-lg last:rounded-b-lg ${
                        selectedCategory === category
                          ? 'text-[#0a61d7] font-semibold hover:bg-gray-100'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {getFilterLabel(category)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Brand Filter Dropdown */}
            <div className="relative">
              <button
                className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-100 text-sm"
                onClick={() => {
                  setShowBrandDropdown(!showBrandDropdown);
                  setShowTypeDropdown(false);
                  setShowCategoryDropdown(false); // Close other dropdowns when opening brand dropdown
                }}
              >
                {getFilterLabel(selectedBrand)}
                <ChevronDown className="w-4 h-4 ml-1 text-gray-500" />
              </button>
              {showBrandDropdown && (
                <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow z-20">
                  {brands.map((brand) => (
                    <button
                      key={brand}
                      onClick={() => {
                        setSelectedBrand(brand);
                        setShowBrandDropdown(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-sm first:rounded-t-lg last:rounded-b-lg ${
                        selectedBrand === brand
                          ? 'text-[#0a61d7] font-semibold hover:bg-gray-100'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {getFilterLabel(brand)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded transition-colors ${
                viewMode === 'grid' ? 'bg-white text-[#0a61d7] shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded transition-colors ${
                viewMode === 'list' ? 'bg-white text-[#0a61d7] shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Select All Checkbox - Only show in grid view */}
        {viewMode === 'grid' && pagedProducts.length > 0 && (
          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={handleSelectAll}
              className={`w-5 h-5 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                selectedProducts.length === pagedProducts.filter(p => canSelectProduct(p.productId)).length && pagedProducts.filter(p => canSelectProduct(p.productId)).length > 0
                  ? 'bg-green-500 border-green-500'
                  : 'bg-white border-gray-300 hover:border-green-400'
              }`}
            >
              {selectedProducts.length === pagedProducts.filter(p => canSelectProduct(p.productId)).length && pagedProducts.filter(p => canSelectProduct(p.productId)).length > 0 && (
                <Check className="w-3 h-3 text-white" />
              )}
            </button>
            <span className="text-sm text-gray-700">
              {tProducts('selectAllAvailable', {
                selected: selectedProducts.length,
                total: pagedProducts.filter(p => canSelectProduct(p.productId)).length,
              })}
            </span>
          </div>
        )}

        {/* Selection Summary */}
        {selectedProducts.length > 0 && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm text-blue-700">
                {selectedProducts.length === 1
                  ? tProducts('productsSelected', { count: selectedProducts.length })
                  : tProducts('productsSelectedPlural', { count: selectedProducts.length })}
                {selectedProducts.some(productId => currentOfferProductIds.has(productId)) && tProducts('someHaveOffers')}
              </span>
              <div className="flex items-center gap-3">
                {selectedProducts.some(productId => currentOfferProductIds.has(productId)) && (
                  <button
                    onClick={() => setShowRemoveConfirm(true)}
                    className="text-xs text-red-600 hover:text-red-800 font-medium"
                  >
                    {tProducts('removeOffer')}
                  </button>
                )}
                <button
                  onClick={() => setSelectedProducts([])}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  {tProducts('clearSelection')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Products Display */}
      {pagedProducts.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">{tProducts('emptyTitle')}</h3>
          <p className="text-gray-500 mb-4">
            {searchTerm || selectedType !== 'All Types' || selectedCategory !== 'All Categories' || selectedBrand !== 'All Brands'
              ? tProducts('emptyFiltered')
              : tProducts('emptyNoProducts')
            }
          </p>
          {searchTerm || selectedType !== 'All Types' || selectedCategory !== 'All Categories' || selectedBrand !== 'All Brands' ? (
            <button
              onClick={() => {
                handleSearchChange('');
                handleTypeChange('All Types');
                handleCategoryChange('All Categories');
                handleBrandChange('All Brands');
              }}
              className="px-4 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#084ba6] transition-colors"
            >
              {tProducts('clearFilters')}
            </button>
          ) : (
            <button
              onClick={() => window.location.href = '/products/add'}
              className="px-4 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#084ba6] transition-colors"
            >
              {tProducts('addProduct')}
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {pagedProducts.map((product) => (
            <div
              key={product.id}
              className={`bg-white rounded-lg border border-gray-200 overflow-hidden transition-shadow ${
                shouldShowAsDisabled(product.productId)
                  ? 'bg-gray-100 opacity-60 cursor-not-allowed'
                  : 'hover:shadow-md cursor-pointer'
              } ${
                selectedProducts.includes(product.productId)
                  ? 'ring-2 ring-blue-500 border-blue-500'
                  : ''
              }`}
              onClick={(e) => {
                if (!(e.target as HTMLElement).closest('button') && canSelectProduct(product.productId)) {
                  handleProductSelect(product.productId);
                }
              }}
            >
              <div className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleProductSelect(product.productId)}
                        disabled={!canSelectProduct(product.productId)}
                        className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                          shouldShowAsDisabled(product.productId)
                            ? 'bg-gray-200 border-gray-300 cursor-not-allowed'
                            : selectedProducts.includes(product.productId)
                            ? 'bg-green-500 border-green-500'
                            : 'bg-white border-gray-300 hover:border-green-400'
                        }`}
                      >
                        {selectedProducts.includes(product.productId) && (
                          <Check className="w-3 h-3 text-white" />
                        )}
                      </button>
                      
                    <div className="flex-1">
                      <h3 className="font-medium text-black text-sm line-clamp-2">{product.name}</h3>
                      <p className="text-xs text-gray-500">{product.brand}</p>
                      {shouldShowAsDisabled(product.productId) && (
                        <div className="mt-1">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          {tProducts('hasOffer')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                    {(product.isInCurrentOffer || (product.hasOffer && product.offerBadge)) && product.offerBadge && (
                      <div className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                        {translateOfferBadge(product.offerBadge)}
                      </div>
                    )}
                </div>

                <div className="space-y-2 mb-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">{tProducts('typeLabel')}</span>
                    <span className="text-black">{product.productType}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">{tProducts('categoryLabel')}</span>
                    <span className="text-black">{product.productCategory}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">{tProducts('priceLabel')}</span>
                    <span className="text-black font-medium">
                      {getPriceDisplay(product)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">{tProducts('stockLabel')}</span>
                    <span className={`${getStockStatus(product).color}`}>
                      {(() => {
                        const variantOptionsStock = product.variantOptions?.reduce((sum, vo) => sum + (vo.stockQuantity || 0), 0) || 0;
                        return variantOptionsStock;
                      })()} {tProducts('units')}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(product.status)}`}>
                    {translateRecordStatus(product.status)}
                  </span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStockStatus(product).bg} ${getStockStatus(product).color}`}>
                    {translateStockStatus(getStockStatus(product).label)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="py-3 px-4 font-medium text-xs uppercase text-gray-500">
                    <button
                      onClick={handleSelectAll}
                      className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                        selectedProducts.length === pagedProducts.filter(p => canSelectProduct(p.productId)).length && pagedProducts.filter(p => canSelectProduct(p.productId)).length > 0
                          ? 'bg-green-500 border-green-500'
                          : 'bg-white border-gray-300 hover:border-green-400'
                      }`}
                    >
                      {selectedProducts.length === pagedProducts.filter(p => canSelectProduct(p.productId)).length && pagedProducts.filter(p => canSelectProduct(p.productId)).length > 0 && (
                        <Check className="w-3 h-3 text-white" />
                      )}
                    </button>
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-xs uppercase text-gray-500">{tProducts('columns.product')}</th>
                  <th className="text-left py-3 px-4 font-medium text-xs uppercase text-gray-500">{tProducts('columns.type')}</th>
                  <th className="text-left py-3 px-4 font-medium text-xs uppercase text-gray-500">{tProducts('columns.category')}</th>
                  <th className="text-left py-3 px-4 font-medium text-xs uppercase text-gray-500">{tProducts('columns.brand')}</th>
                  <th className="text-right py-3 px-4 font-medium text-xs uppercase text-gray-500">{tProducts('columns.price')}</th>
                  <th className="text-right py-3 px-4 font-medium text-xs uppercase text-gray-500">{tProducts('columns.stock')}</th>
                  <th className="text-left py-3 px-4 font-medium text-xs uppercase text-gray-500">{tProducts('columns.status')}</th>
                </tr>
              </thead>
              <tbody>
                {pagedProducts.map((product) => (
                  <tr 
                    key={product.id} 
                    className={`border-b border-gray-100 text-xs transition whitespace-nowrap ${
                      shouldShowAsDisabled(product.productId)
                        ? 'bg-gray-100 opacity-60 cursor-not-allowed' 
                        : 'hover:bg-gray-50 cursor-pointer'
                    } ${
                      selectedProducts.includes(product.productId) 
                        ? 'bg-blue-50'
                        : ''
                    }`}
                    onClick={(e) => {
                      if (canSelectProduct(product.productId)) {
                        handleRowClick(product.productId, e);
                      }
                    }}
                  >
                    <td className="w-12 py-4 px-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleProductSelect(product.productId)}
                          disabled={!canSelectProduct(product.productId)}
                          className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                            shouldShowAsDisabled(product.productId)
                              ? 'bg-gray-200 border-gray-300 cursor-not-allowed'
                              : selectedProducts.includes(product.productId)
                              ? 'bg-green-500 border-green-500'
                              : 'bg-white border-gray-300 hover:border-green-400'
                          }`}
                        >
                          {selectedProducts.includes(product.productId) && (
                            <Check className="w-3 h-3 text-white" />
                          )}
                        </button>
                        
                      </div>
                    </td>
                    <td className="py-4 px-4 text-gray-700">
                      <div className="font-medium text-black truncate">{product.name}</div>
                      {shouldShowAsDisabled(product.productId) && (
                        <div className="mt-1">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          {tProducts('hasOffer')}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-4 text-gray-700 truncate">{product.productType}</td>
                    <td className="py-4 px-4 text-gray-700 truncate">{product.productCategory}</td>
                    <td className="py-4 px-4 text-gray-700 truncate">{product.brand}</td>
                    <td className="py-4 px-4 text-gray-700 font-medium text-right">
                      {getPriceDisplay(product)}
                    </td>
                    <td className="py-4 px-4 text-right">
                      <span className={`${getStockStatus(product).color}`}>
                        {(() => {
                          const variantOptionsStock = product.variantOptions?.reduce((sum, vo) => sum + (vo.stockQuantity || 0), 0) || 0;
                          return variantOptionsStock;
                        })()}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex flex-col gap-1">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(product.status)}`}>
                          {translateRecordStatus(product.status)}
                        </span>
                        {(product.isInCurrentOffer || (product.hasOffer && product.offerBadge)) && product.offerBadge ? (
                          <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full border border-blue-200">{translateOfferBadge(product.offerBadge)}</span>
                        ) : (
                          <span className="text-gray-400 text-xs">{tProducts('noOffer')}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalRows > 0 && (
        <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-gray-500">
            {tProducts('pagination.showing', { from: fromRow, to: toRow, total: totalRows })}
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
      )}

      {/* Apply Offer Modal */}
      {showOfferModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white rounded-t-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#0a61d7] rounded-lg flex items-center justify-center">
                  <Target className="w-5 h-5 text-white" />
                </div>
                <div>
                  {(() => {
                    // Check if all selected products are already in the current offer
                    const allInCurrentOffer = selectedProducts.every(productId => 
                      currentOfferProductIds.has(productId)
                    );
                    return (
                      <>
                        <h3 className="text-lg font-semibold text-black">
                          {allInCurrentOffer ? tProducts('modalRemoveTitle') : tProducts('modalApplyTitle')}
                        </h3>
                  <p className="text-gray-500 text-sm">
                          {allInCurrentOffer 
                            ? tProducts('modalRemoveSubtitle', { count: selectedProducts.length })
                            : tProducts('modalApplySubtitle', { count: selectedProducts.length })
                          }
                  </p>
                      </>
                    );
                  })()}
                </div>
              </div>
              <button
                onClick={() => setShowOfferModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form - Scrollable Content */}
            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              {/* Selected Products Summary */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-blue-900 mb-2">{tProducts('selectedProducts')}</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {selectedProducts.slice(0, 4).map((productId) => {
                    const product = displayProducts.find(p => p.productId === productId);
                    return product ? (
                      <div key={productId} className="flex items-center gap-2 text-xs">
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        <span className="text-blue-800">{product.name}</span>
                      </div>
                    ) : null;
                  })}
                  {selectedProducts.length > 4 && (
                    <div className="flex items-center gap-2 text-xs">
                      <div className="w-2 h-2 bg-blue-300 rounded-full"></div>
                      <span className="text-blue-600 font-medium">
                        {tProducts('andMoreProducts', { count: selectedProducts.length - 4 })}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Offer Information */}
              <div className="space-y-4">
                <h4 className="text-md font-semibold text-black">{tProducts('offerInformation')}</h4>
                
                {/* Offer Types Section */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h5 className="text-sm font-medium text-gray-700">{tProducts('offerTypesSection')}</h5>
                    {offerTypes && offerTypes.length > 0 && (
                      <button
                        onClick={selectAllOfferTypes}
                        className="text-xs text-[#0a61d7] hover:text-[#084ba6] font-medium"
                      >
                        {selectedOfferTypes.length === offerTypes.length ? tProducts('deselectAll') : tProducts('selectAll')}
                      </button>
                    )}
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="space-y-3">
                      {/* Show all offer types with checkboxes */}
                      {offerTypes && offerTypes.length > 0 ? (
                        offerTypes.map((offerType, index: number) => (
                          <div key={offerType.id} className={`${index > 0 ? 'pt-3 border-t border-gray-300' : ''}`}>
                            <div className="flex items-start gap-3">
                              <button
                                onClick={() => toggleOfferType(offerType.type)}
                                className={`mt-0.5 w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center flex-shrink-0 ${
                                  selectedOfferTypes.includes(offerType.type)
                                    ? 'bg-[#0a61d7] border-[#0a61d7]'
                                    : 'bg-white border-gray-300 hover:border-[#0a61d7]'
                                }`}
                              >
                                {selectedOfferTypes.includes(offerType.type) && (
                                  <Check className="w-3 h-3 text-white" />
                                )}
                              </button>
                              <div className="flex-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-gray-600">{tProducts('offerNameLabel')}</span>
                                  <span className="text-xs font-medium text-black">{offerType.name}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-gray-600">{tProducts('typeLabelModal')}</span>
                                  <span className="text-xs font-medium text-black">{getTypeLabel(offerType.type as 'percentage' | 'fixed' | 'buy_x_get_y')}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-gray-500">{tProducts('noOfferTypes')}</div>
                      )}
                    </div>
                  </div>
                  {selectedOfferTypes.length > 0 && (
                    <div className="text-xs text-[#0a61d7] font-medium">
                      {selectedOfferTypes.length === 1
                        ? tProducts('offerTypesSelected', { count: selectedOfferTypes.length })
                        : tProducts('offerTypesSelectedPlural', { count: selectedOfferTypes.length })}
                    </div>
                  )}
                </div>

                {/* Date Ranges Section */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h5 className="text-sm font-medium text-gray-700">{tProducts('activePeriods')}</h5>
                    {dateRanges && dateRanges.length > 0 && (
                      <button
                        onClick={selectAllDateRanges}
                        className="text-xs text-[#0a61d7] hover:text-[#084ba6] font-medium"
                      >
                        {selectedDateRanges.length === dateRanges.length ? tProducts('deselectAll') : tProducts('selectAll')}
                      </button>
                    )}
                  </div>
                  
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="space-y-3">
                      {/* Show all date ranges with checkboxes */}
                      {dateRanges && dateRanges.length > 0 ? (
                        dateRanges.map((range, index: number) => (
                          <div key={range.id} className={`${index > 0 ? 'pt-3 border-t border-gray-300' : ''}`}>
                            <div className="flex items-start gap-3">
                              <button
                                onClick={() => toggleDateRange(range.id)}
                                className={`mt-0.5 w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center flex-shrink-0 ${
                                  selectedDateRanges.includes(range.id)
                                    ? 'bg-[#0a61d7] border-[#0a61d7]'
                                    : 'bg-white border-gray-300 hover:border-[#0a61d7]'
                                }`}
                              >
                                {selectedDateRanges.includes(range.id) && (
                                  <Check className="w-3 h-3 text-white" />
                                )}
                              </button>
                              <div className="flex-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-gray-600">{tProducts('activePeriodLabel')}</span>
                                  <span className="text-xs font-medium text-black">{range.name}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-gray-600">{tProducts('durationLabel')}</span>
                                  <span className="text-xs font-medium text-black">
                                    {new Date(range.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(range.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-gray-500">{tProducts('noDateRanges')}</div>
                      )}
                    </div>
                  </div>
                  {selectedDateRanges.length > 0 && (
                    <div className="text-xs text-[#0a61d7] font-medium">
                      {selectedDateRanges.length === 1
                        ? tProducts('dateRangesSelected', { count: selectedDateRanges.length })
                        : tProducts('dateRangesSelectedPlural', { count: selectedDateRanges.length })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex flex-col gap-3 p-4 border-t border-gray-200 text-sm flex-shrink-0 rounded-b-lg">
              {/* Validation Message - Date ranges are now optional */}
              {selectedOfferTypes.length === 0 && (
                <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2">
                  ⚠️ {tProducts('selectOfferTypeWarning')}
                </div>
              )}
              
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => {
                    setShowOfferModal(false);
                    // Reset selections
                    setSelectedOfferTypes([]);
                    setSelectedDateRanges([]);
                  }}
                  className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition-colors"
                >
                  {tShared('cancel')}
                </button>
                {(() => {
                  // Check if all selected products are already in the current offer
                  const allInCurrentOffer = selectedProducts.every(productId => 
                    currentOfferProductIds.has(productId)
                  );
                  
                  if (allInCurrentOffer) {
                    // If all products are in current offer, show remove button
                    return (
                      <button
                        onClick={() => {
                          // Remove products from current offer
                          selectedProducts.forEach(productId => {
                            handleRemoveFromOffer(productId);
                          });
                          setShowOfferModal(false);
                          setSelectedProducts([]);
                          setSelectedOfferTypes([]);
                          setSelectedDateRanges([]);
                        }}
                        className="flex items-center gap-2 px-6 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
                      >
                        <X className="w-4 h-4" />
                        {tProducts('removeOffer')}
                      </button>
                    );
                  }
                  
                  // Otherwise, show apply button
                  return (
                <button
                  disabled={selectedOfferTypes.length === 0}
                  onClick={() => {
                    // Validate selections - date ranges are now optional
                    if (selectedOfferTypes.length === 0) {
                      alert(tProducts('selectOfferTypeAlert'));
                      return;
                    }
                    // Date ranges are optional - no validation needed
                  if (isBatchEditMode && offerData) {
                    // In batch edit mode, update parent state
                    const existingProducts = offerData.products || [];
                    const newProducts = selectedProducts.map(productId => ({
                      id: `po-${Date.now()}-${productId}`,
                      productId,
                      offerId: offerData.id,
                      discountType: 'percentage' as const,
                      discountValue: 0,
                      isActive: true
                    }));
                    const updatedProducts = [...existingProducts, ...newProducts];
                    
                    // Update product offer badges based on selected types
                    const badge = computeOfferBadge();
                    const updatedBadges = { ...productOfferBadges };
                    selectedProducts.forEach(id => {
                      updatedBadges[id] = badge;
                    });
                    
                    // Filter discount types to only include selected ones
                    const filteredDiscountTypes = offerData?.discountTypes?.map((dt) => ({
                      ...dt,
                      isActive: selectedOfferTypes.includes(dt.discountType) // Mark as active only if selected
                    })) || [];
                    
                    onOfferChange!({ 
                      products: updatedProducts,
                      productOfferBadges: updatedBadges,
                      discountTypes: filteredDiscountTypes // Update which discount types are active
                    });
                    
                    // Update local UI
                    const badgeForUI = computeOfferBadge();
                    setProducts((prev) => prev.map((p) => {
                      if (selectedProducts.includes(p.productId)) {
                        const discountAmount = calculateDiscountAmount(p);
                        return { 
                          ...p, 
                          hasOffer: true, 
                          offerBadge: badgeForUI as 'Discount' | 'Promotion' | 'All Offers' | 'Offer',
                          offerDiscount: discountAmount,
                          offerType: 'percentage' as const
                        };
                      }
                      return p;
                    }));
                    
                    // Update currentOfferProductIds to add the selected products
                    setCurrentOfferProductIds(prev => {
                      const newSet = new Set(prev);
                      selectedProducts.forEach(id => newSet.add(id));
                      return newSet;
                    });
                  } else {
                    // In create view, update local state
                    const badgeForCreate = computeOfferBadge();
                    setProducts((prev) => prev.map((p) => {
                      if (selectedProducts.includes(p.productId)) {
                        const discountAmount = calculateDiscountAmount(p);
                        return { 
                          ...p, 
                          hasOffer: true, 
                          offerBadge: badgeForCreate as 'Discount' | 'Promotion' | 'All Offers' | 'Offer',
                          offerDiscount: discountAmount,
                          offerType: 'percentage' as const
                        };
                      }
                      return p;
                    }));
                    selectedProducts.forEach((id) => setProductOfferBadge(id, badgeForCreate));
                    
                    // Update currentOfferProductIds to add the selected products
                    setCurrentOfferProductIds(prev => {
                      const newSet = new Set(prev);
                      selectedProducts.forEach(id => newSet.add(id));
                      return newSet;
                    });
                  }
                  setShowOfferModal(false);
                  setSelectedProducts([]);
                  // Reset selections
                  setSelectedOfferTypes([]);
                  setSelectedDateRanges([]);
                }}
                className={`flex items-center gap-2 px-6 py-2 rounded-lg transition-colors ${
                  selectedOfferTypes.length === 0
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-[#0a61d7] text-white hover:bg-[#084ba6]'
                }`}
              >
                {tProducts('applyOfferButton')}
              </button>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Remove Offer Modal */}
      {showRemoveConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-black">{tProducts('removeConfirmTitle')}</h3>
            </div>
            <div className="p-4 space-y-2">
              {(() => {
                // Count products that are in the current offer (have the offer applied)
                const productsInCurrentOffer = selectedProducts.filter(id => 
                  currentOfferProductIds.has(id)
                );
                const count = productsInCurrentOffer.length;
                
                return (
                  <>
              <p className="text-sm text-gray-700">
                      {tProducts('removeConfirmBody', { count })}
              </p>
                    <p className="text-xs text-gray-500">{tProducts('removeConfirmHint')}</p>
                  </>
                );
              })()}
            </div>
            <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200">
              <button
                onClick={() => setShowRemoveConfirm(false)}
                className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm hover:bg-gray-200"
              >
                {tShared('cancel')}
              </button>
              <button
                onClick={() => {
                  // Get products that are actually in the current offer
                  const productsToRemove = selectedProducts.filter(id => 
                    currentOfferProductIds.has(id)
                  );
                  
                  if (productsToRemove.length === 0) {
                    setShowRemoveConfirm(false);
                    return;
                  }
                  
                  if (isBatchEditMode && offerData) {
                    // In batch edit mode, update parent state
                    const existingProducts = offerData.products || [];
                    const updatedProducts = existingProducts.filter((p) => 
                      !productsToRemove.includes(p.productId)
                    );
                    
                    // Update product offer badges - remove badges for products being removed
                    const updatedBadges = { ...productOfferBadges };
                    productsToRemove.forEach((id: string) => {
                      delete updatedBadges[id];
                    });
                    
                    // Call parent's onOfferChange to update the offer data
                    onOfferChange!({ 
                      products: updatedProducts,
                      productOfferBadges: updatedBadges
                    });
                    
                    // Update local UI - remove the offer badge and isInCurrentOffer flag
                    setProducts((prev) => prev.map((p) => {
                      if (productsToRemove.includes(p.productId)) {
                        return { 
                          ...p, 
                          offerBadge: undefined,
                          isInCurrentOffer: false,
                        };
                      }
                      return p;
                    }));
                    
                    // Update currentOfferProductIds to remove the products
                    setCurrentOfferProductIds(prev => {
                      const newSet = new Set(prev);
                      productsToRemove.forEach((id: string) => newSet.delete(id));
                      return newSet;
                    });
                  } else {
                    // In create view, update local state
                    setProducts((prev) => prev.map((p) => {
                      if (productsToRemove.includes(p.productId)) {
                        return { 
                          ...p, 
                          offerBadge: undefined,
                          isInCurrentOffer: false,
                        };
                      }
                      return p;
                    }));
                    
                    // Clear badges from store
                    productsToRemove.forEach((id: string) => clearProductOfferBadge(id));
                    
                    // Update currentOfferProductIds to remove the products
                    setCurrentOfferProductIds(prev => {
                      const newSet = new Set(prev);
                      productsToRemove.forEach((id: string) => newSet.delete(id));
                      return newSet;
                    });
                  }
                  
                  // Clear selection and close modal
                  setSelectedProducts([]);
                  setShowRemoveConfirm(false);
                }}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700"
              >
                {tTable('remove')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

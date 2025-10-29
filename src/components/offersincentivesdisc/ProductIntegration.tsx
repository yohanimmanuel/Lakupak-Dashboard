'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Package, Search, Filter, Plus, Check, X, Target, Tag, Grid, List, ChevronDown, ChevronLeft, ChevronRight, Calendar, Clock, ChevronUp } from 'lucide-react';
import { formatCurrency, getDefaultCurrency, parsePrice } from '@/utils/currencyUtils';
import { parseNumberByCurrency } from '@/config/currencyConfig';
import { useUserStore } from '@/store/userStore';
import { Product } from '@/types/product';
import { SelectedProduct, useOfferCreationStore } from '@/store/offerCreationStore';

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

interface TimeSlot {
  id: string;
  name: string;
  description?: string | null | undefined;
  startTime: string;
  endTime: string;
  days: string[];
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
  timeSlots?: TimeSlot[];
  products: OfferProduct[];
  [key: string]: unknown;
  startDate: Date | string;
  endDate: Date | string;
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
}

export default function ProductIntegration({ 
  isNewOffer = false, 
  offerData,
  onOfferChange,
  onAddProduct, 
  onRemoveProduct, 
  onUpdateProductDiscount 
}: ProductIntegrationProps) {
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
  
  // Ranges/time slots and configured offer types come from centralized offer creation store
  const store = useOfferCreationStore();
  const { dateRanges: storeDateRanges, timeSlots: storeTimeSlots, discountTypes: storeDiscountTypes, productOfferBadges: storeProductOfferBadges, setProductOfferBadge, clearProductOfferBadge } = store;
  
  // Use offerData if provided (details view), otherwise use store data (create view)
  const dateRanges = offerData?.dateRanges || storeDateRanges;
  const timeSlots = offerData?.timeSlots || storeTimeSlots;
  const discountTypes = offerData?.discountTypes || storeDiscountTypes;
  const productOfferBadges = offerData?.productOfferBadges || storeProductOfferBadges;
  const isDetailsView = Boolean(offerData); // Flag to determine if we're in details view
  const isBatchEditMode = Boolean(offerData && onOfferChange);
  
  // Modal states
  const [rangeTab, setRangeTab] = useState<'date' | 'time'>('date');
  const [showMoreOfferTypes, setShowMoreOfferTypes] = useState(false);
  const [showMoreRanges, setShowMoreRanges] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  
  // Selection states for flexible offer/period application
  const [selectedOfferTypes, setSelectedOfferTypes] = useState<string[]>([]);
  const [selectedDateRanges, setSelectedDateRanges] = useState<string[]>([]);
  const [selectedTimeSlots, setSelectedTimeSlots] = useState<string[]>([]);

  // Map real discount types from store to display-friendly items
  const getTypeLabel = (t: 'percentage' | 'fixed' | 'buy_x_get_y') => {
    switch (t) {
      case 'percentage':
        return 'Percentage Discount';
      case 'fixed':
        return 'Fixed Amount Discount';
      case 'buy_x_get_y':
        return 'Buy X Get Y';
      default:
        return 'Discount';
    }
  };

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

  const toggleTimeSlot = (slotId: string) => {
    setSelectedTimeSlots(prev =>
      prev.includes(slotId)
        ? prev.filter(id => id !== slotId)
        : [...prev, slotId]
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

  const selectAllTimeSlots = () => {
    if (selectedTimeSlots.length === timeSlots.length) {
      setSelectedTimeSlots([]);
    } else {
      setSelectedTimeSlots(timeSlots.map((ts) => ts.id));
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
    
    // Use variantOptions first, then fallback to legacyVariants
    const firstVariantOption = product.variantOptions?.[0];
    const firstLegacyVariant = product.legacyVariants?.[0];
    const productPrice = parseNumberByCurrency(
      String(firstVariantOption?.sellingPrice || firstLegacyVariant?.sellingPrice || '0'), 
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
  const [currentOfferProductIds, setCurrentOfferProductIds] = useState<Set<string>>(
    new Set(offerData?.products?.map(p => p.productId) || [])
  );

  // Fetch products from API
  const fetchProducts = useCallback(async () => {
    if (!user?.id) return;
    
    setLoading(true);
    try {
      // Fetch products and active offers
      const [productsResponse, offersResponse] = await Promise.all([
        fetch(`/api/products?userId=${user.id}`),
        fetch(`/api/offers?userId=${user.id}`)
      ]);
      
      if (productsResponse.ok && offersResponse.ok) {
        const productsData = await productsResponse.json();
        const offersData = await offersResponse.json();
        
        // Handle both old format (array) and new format (with pagination)
        const products = productsData.products || productsData;
        const offers = offersData.offers || [];
        
        // Get all product IDs that already have active offers
        // Exclude products from the CURRENT offer being edited (if in edit mode)
        const currentOfferId = offerData?.offerId;
        const productsWithOffers = new Set<string>();
        offers.forEach((offer: OfferData) => {
          // Skip the current offer being edited
          if (offer.offerId === currentOfferId) return;
          
          if (offer.status === 'active' && offer.products) {
            offer.products.forEach((product: OfferProduct) => {
              productsWithOffers.add(product.productId);
            });
          }
        });
        
        // Transform products to include offer information
        const productsWithOfferInfo: ProductWithOffer[] = products.map((product: Product) => {
          const storeHasOffer = Boolean(productOfferBadges[product.productId]);
          const apiHasOffer = productsWithOffers.has(product.productId);
          
            // Check if product is in current offer (for editing mode)
            const isInCurrentOffer = currentOfferProductIds.has(product.productId);
            
            // Determine hasOffer based on whether product is in current offer or not:
            // - If in current offer: use ONLY store data (ignore API)
            // - If not in current offer: use API data (store should be empty anyway)
            const hasOffer = isInCurrentOffer ? storeHasOffer : apiHasOffer;
          const productBadge = storeHasOffer ? productOfferBadges[product.productId] : undefined;
          
          return {
            ...product,
            hasOffer,
            offerDiscount: hasOffer ? calculateDiscountAmount(product as ProductWithOffer) : 0,
            offerType: hasOffer ? 'percentage' : undefined,
            offerBadge: (isInCurrentOffer || storeHasOffer) ? productBadge as 'Discount' | 'Promotion' | 'All Offers' | 'Offer' : undefined,
          };
        });
        
        setProducts(productsWithOfferInfo);
      } else {
        setProducts([]);
      }
    } catch (error) {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, productOfferBadges, currentOfferProductIds]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const productTypes = ['All Types', ...Array.from(new Set(products.map(p => p.productType).filter(Boolean)))];
  const productCategories = ['All Categories', ...Array.from(new Set(products.map(p => p.productCategory).filter(Boolean)))];
  const brands = ['All Brands', ...Array.from(new Set(products.map(p => p.brand)))];

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.productType.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.productCategory.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.brand.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = selectedType === 'All Types' || product.productType === selectedType;
    const matchesCategory = selectedCategory === 'All Categories' || product.productCategory === selectedCategory;
    const matchesBrand = selectedBrand === 'All Brands' || product.brand === selectedBrand;
    
    return matchesSearch && matchesType && matchesCategory && matchesBrand;
  });

  // Pagination logic
  const totalRows = filteredProducts.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
  const pagedProducts = filteredProducts.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  const fromRow = totalRows === 0 ? 0 : (page - 1) * rowsPerPage + 1;
  const toRow = Math.min(page * rowsPerPage, totalRows);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [searchTerm, selectedType, selectedCategory, selectedBrand]);

  // Determine if we're editing an existing offer
  const isEditingOffer = Boolean(offerData?.id);

  // Update currentOfferProductIds when offerData changes
  useEffect(() => {
    setCurrentOfferProductIds(new Set(offerData?.products?.map(p => p.productId) || []));
  }, [offerData?.products]);

  // Sync local products state with parent offerData changes
  useEffect(() => {
    if (offerData?.productOfferBadges) {
      setProducts((prev) => prev.map((p) => {
        const hasOfferFromParent = Boolean(offerData.productOfferBadges![p.productId]);
        const isInCurrentOffer = Boolean(offerData.products?.find(op => op.productId === p.productId));
        
        // Update hasOffer based on parent state
        return {
          ...p,
          hasOffer: hasOfferFromParent || isInCurrentOffer,
          offerBadge: (offerData.productOfferBadges![p.productId] || (isInCurrentOffer ? 'Offer' : undefined)) as 'Discount' | 'Promotion' | 'All Offers' | 'Offer' | undefined
        };
      }));
    }
  }, [offerData?.productOfferBadges, offerData?.products]);
  
  // Check if product can be selected
  const canSelectProduct = (productId: string) => {
    const product = products.find(p => p.productId === productId);
    if (!product) return false;
    
    // If product has an offer from a DIFFERENT offer, it cannot be selected
    const hasOfferFromOtherOffers = product.hasOffer && !currentOfferProductIds.has(productId);
    return !hasOfferFromOtherOffers;
  };

  // Helper function to check if product should show as disabled in UI
  const shouldShowAsDisabled = (productId: string) => {
    const product = products.find(p => p.productId === productId);
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
    const legacyVariants = product.legacyVariants || [];
    
    // Collect all prices from variantOptions and legacyVariants
    const prices: number[] = [];
    
    // Add prices from variantOptions
    variantOptions.forEach(option => {
      const price = parsePrice(String(option.sellingPrice), userCurrency);
      if (price > 0) {
        prices.push(price);
      }
    });
    
    // Add prices from legacyVariants
    legacyVariants.forEach(variant => {
      const price = parsePrice(String(variant.sellingPrice), userCurrency);
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
    // Calculate total stock from variantOptions and legacyVariants
    const variantOptionsStock = product.variantOptions?.reduce((sum, vo) => sum + (vo.stockQuantity || 0), 0) || 0;
    const legacyVariantsStock = product.legacyVariants?.reduce((sum, variant) => sum + (variant.stockQuantity || 0), 0) || 0;
    const totalStock = variantOptionsStock + legacyVariantsStock;
    
    const variantOptionsThreshold = product.variantOptions?.reduce((sum, vo) => sum + (vo.lowStockThreshold || 0), 0) || 0;
    const legacyVariantsThreshold = product.legacyVariants?.reduce((sum, variant) => sum + (variant.lowStockThreshold || 0), 0) || 0;
    const totalLowStockThreshold = variantOptionsThreshold + legacyVariantsThreshold;
    
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
            <p className="text-gray-600">Loading products...</p>
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
            {isNewOffer ? 'Select Products for Offer' : 'Your Products'}
          </h2>
          <p className="text-gray-500 text-sm">
            {isNewOffer ? 'Choose which products to include in your new offer' : 'Select products for this offer (one offer per product)'}
          </p>
        </div>
        {selectedProducts.length > 0 && (
          <button
            onClick={() => setShowOfferModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0a61d7] text-white font-semibold hover:bg-[#084ba6] transition text-sm"
          >
            <Plus className="w-4 h-4" />
            Apply Offer ({selectedProducts.length})
          </button>
        )}
      </div>

      {/* Filters and Search */}
      <div className="bg-white">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Search */}
          <div className="flex gap-2 w-full md:w-auto items-center">
            <div className="relative w-full md:w-150">
              <input
                type="text"
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
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
                {selectedType}
                <ChevronDown className="w-4 h-4 ml-1 text-gray-500" />
              </button>
              {showTypeDropdown && (
                <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow z-20">
                  {productTypes.map((type) => (
                    <button
                      key={type}
                      onClick={() => {
                        setSelectedType(type);
                        setShowTypeDropdown(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-sm first:rounded-t-lg last:rounded-b-lg ${
                        selectedType === type
                          ? 'text-[#0a61d7] font-semibold hover:bg-gray-100'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {type}
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
                {selectedCategory}
                <ChevronDown className="w-4 h-4 ml-1 text-gray-500" />
              </button>
              {showCategoryDropdown && (
                <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow z-20">
                  {productCategories.map((category) => (
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
                      {category}
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
                {selectedBrand}
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
                      {brand}
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
              Select All Available ({selectedProducts.length}/{pagedProducts.filter(p => canSelectProduct(p.productId)).length})
            </span>
          </div>
        )}

        {/* Selection Summary */}
        {selectedProducts.length > 0 && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm text-blue-700">
                {selectedProducts.length} product{selectedProducts.length !== 1 ? 's' : ''} selected
                {selectedProducts.some(productId => currentOfferProductIds.has(productId)) && ' (some have offers)'}
              </span>
              <div className="flex items-center gap-3">
                {selectedProducts.some(productId => currentOfferProductIds.has(productId)) && (
                  <button
                    onClick={() => setShowRemoveConfirm(true)}
                    className="text-xs text-red-600 hover:text-red-800 font-medium"
                  >
                    Remove Offer
                  </button>
                )}
                <button
                  onClick={() => setSelectedProducts([])}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  Clear Selection
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
          <h3 className="text-lg font-medium text-gray-900 mb-2">No products found</h3>
          <p className="text-gray-500 mb-4">
            {searchTerm || selectedType !== 'All Types' || selectedCategory !== 'All Categories' || selectedBrand !== 'All Brands'
              ? 'No products match your current filters. Try adjusting your search criteria.'
              : 'You don\'t have any products yet. Create your first product to get started.'
            }
          </p>
          {searchTerm || selectedType !== 'All Types' || selectedCategory !== 'All Categories' || selectedBrand !== 'All Brands' ? (
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedType('All Types');
                setSelectedCategory('All Categories');
                setSelectedBrand('All Brands');
              }}
              className="px-4 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#084ba6] transition-colors"
            >
              Clear Filters
            </button>
          ) : (
            <button
              onClick={() => window.location.href = '/products/add'}
              className="px-4 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#084ba6] transition-colors"
            >
              Add Product
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
                            Has Active Offer
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                    {product.hasOffer && product.offerBadge && (
                      <div className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                        {product.offerBadge}
                      </div>
                    )}
                </div>

                <div className="space-y-2 mb-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Type:</span>
                    <span className="text-black">{product.productType}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Category:</span>
                    <span className="text-black">{product.productCategory}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Price:</span>
                    <span className="text-black font-medium">
                      {getPriceDisplay(product)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Stock:</span>
                    <span className={`${getStockStatus(product).color}`}>
                      {(() => {
                        const variantOptionsStock = product.variantOptions?.reduce((sum, vo) => sum + (vo.stockQuantity || 0), 0) || 0;
                        const legacyVariantsStock = product.legacyVariants?.reduce((sum, variant) => sum + (variant.stockQuantity || 0), 0) || 0;
                        return variantOptionsStock + legacyVariantsStock;
                      })()} units
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(product.status)}`}>
                    {product.status.charAt(0).toUpperCase() + product.status.slice(1).toLowerCase()}
                  </span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStockStatus(product).bg} ${getStockStatus(product).color}`}>
                    {getStockStatus(product).label}
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
                  <th className="text-left py-3 px-4 font-medium text-xs uppercase text-gray-500">Product</th>
                  <th className="text-left py-3 px-4 font-medium text-xs uppercase text-gray-500">Type</th>
                  <th className="text-left py-3 px-4 font-medium text-xs uppercase text-gray-500">Category</th>
                  <th className="text-left py-3 px-4 font-medium text-xs uppercase text-gray-500">Brand</th>
                  <th className="text-right py-3 px-4 font-medium text-xs uppercase text-gray-500">Price</th>
                  <th className="text-right py-3 px-4 font-medium text-xs uppercase text-gray-500">Stock</th>
                  <th className="text-left py-3 px-4 font-medium text-xs uppercase text-gray-500">Status</th>
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
                            Has Active Offer
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
                          const legacyVariantsStock = product.legacyVariants?.reduce((sum, variant) => sum + (variant.stockQuantity || 0), 0) || 0;
                          return variantOptionsStock + legacyVariantsStock;
                        })()}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex flex-col gap-1">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(product.status)}`}>
                          {product.status.charAt(0).toUpperCase() + product.status.slice(1).toLowerCase()}
                        </span>
                        {product.hasOffer && product.offerBadge ? (
                          <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full border border-blue-200">{product.offerBadge}</span>
                        ) : (
                          <span className="text-gray-400 text-xs">No offer</span>
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
                  <h3 className="text-lg font-semibold text-black">Apply Offer to Products</h3>
                  <p className="text-gray-500 text-sm">
                    Configure offer settings for {selectedProducts.length} selected product{selectedProducts.length !== 1 ? 's' : ''}
                  </p>
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
            <div className="p-4 space-y-4 overflow-y-auto hide-scrollbar flex-1">
              {/* Selected Products Summary */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-blue-900 mb-2">Selected Products</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {selectedProducts.slice(0, 4).map((productId) => {
                    const product = products.find(p => p.productId === productId);
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
                        and {selectedProducts.length - 4} more products...
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Offer Information */}
              <div className="space-y-4">
                <h4 className="text-md font-semibold text-black">Offer Information</h4>
                
                {/* Offer Types Section */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h5 className="text-sm font-medium text-gray-700">Offer Types</h5>
                    {offerTypes && offerTypes.length > 0 && (
                      <button
                        onClick={selectAllOfferTypes}
                        className="text-xs text-[#0a61d7] hover:text-[#084ba6] font-medium"
                      >
                        {selectedOfferTypes.length === offerTypes.length ? 'Deselect All' : 'Select All'}
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
                                  <span className="text-xs text-gray-600">Offer Name:</span>
                                  <span className="text-xs font-medium text-black">{offerType.name}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-gray-600">Type:</span>
                                  <span className="text-xs font-medium text-black">{getTypeLabel(offerType.type as 'percentage' | 'fixed' | 'buy_x_get_y')}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-gray-500">No offer types configured.</div>
                      )}
                    </div>
                  </div>
                  {selectedOfferTypes.length > 0 && (
                    <div className="text-xs text-[#0a61d7] font-medium">
                      {selectedOfferTypes.length} offer type{selectedOfferTypes.length !== 1 ? 's' : ''} selected
                    </div>
                  )}
                </div>

                {/* Date & Time Ranges Section */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h5 className="text-sm font-medium text-gray-700">Active Periods</h5>
                    {rangeTab === 'date' && dateRanges && dateRanges.length > 0 && (
                      <button
                        onClick={selectAllDateRanges}
                        className="text-xs text-[#0a61d7] hover:text-[#084ba6] font-medium"
                      >
                        {selectedDateRanges.length === dateRanges.length ? 'Deselect All' : 'Select All'}
                      </button>
                    )}
                    {rangeTab === 'time' && timeSlots && timeSlots.length > 0 && (
                      <button
                        onClick={selectAllTimeSlots}
                        className="text-xs text-[#0a61d7] hover:text-[#084ba6] font-medium"
                      >
                        {selectedTimeSlots.length === timeSlots.length ? 'Deselect All' : 'Select All'}
                      </button>
                    )}
                  </div>
                  
                  {/* Range Tabs */}
                  <div className="flex gap-1">
                    <button
                      onClick={() => setRangeTab('date')}
                      className={`flex items-center gap-1 px-3 py-1 rounded text-xs font-medium transition-colors ${
                        rangeTab === 'date'
                          ? 'bg-[#0a61d7] text-white'
                          : 'text-gray-600 hover:text-black hover:bg-gray-100'
                      }`}
                    >
                      <Calendar className="w-3 h-3" />
                      Date Ranges
                    </button>
                    <button
                      onClick={() => setRangeTab('time')}
                      className={`flex items-center gap-1 px-3 py-1 rounded text-xs font-medium transition-colors ${
                        rangeTab === 'time'
                          ? 'bg-[#0a61d7] text-white'
                          : 'text-gray-600 hover:text-black hover:bg-gray-100'
                      }`}
                    >
                      <Clock className="w-3 h-3" />
                      Time Slots
                    </button>
                  </div>

                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    {rangeTab === 'date' ? (
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
                                    <span className="text-xs text-gray-600">Active Period:</span>
                                    <span className="text-xs font-medium text-black">{range.name}</span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-600">Duration:</span>
                                    <span className="text-xs font-medium text-black">
                                      {new Date(range.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(range.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-xs text-gray-500">No date ranges configured.</div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {/* Show all time slots with checkboxes */}
                        {timeSlots && timeSlots.length > 0 ? (
                          timeSlots.map((slot, index: number) => (
                            <div key={slot.id} className={`${index > 0 ? 'pt-3 border-t border-gray-300' : ''}`}>
                              <div className="flex items-start gap-3">
                                <button
                                  onClick={() => toggleTimeSlot(slot.id)}
                                  className={`mt-0.5 w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center flex-shrink-0 ${
                                    selectedTimeSlots.includes(slot.id)
                                      ? 'bg-[#0a61d7] border-[#0a61d7]'
                                      : 'bg-white border-gray-300 hover:border-[#0a61d7]'
                                  }`}
                                >
                                  {selectedTimeSlots.includes(slot.id) && (
                                    <Check className="w-3 h-3 text-white" />
                                  )}
                                </button>
                                <div className="flex-1">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-600">Time Slot:</span>
                                    <span className="text-xs font-medium text-black">{slot.name}</span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-600">Schedule:</span>
                                    <span className="text-xs font-medium text-black">
                                      {slot.startTime} - {slot.endTime}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-600">Days:</span>
                                    <span className="text-xs font-medium text-black">{slot.days.join(', ')}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-xs text-gray-500">No time slots configured.</div>
                        )}
                      </div>
                    )}
                  </div>
                  {rangeTab === 'date' && selectedDateRanges.length > 0 && (
                    <div className="text-xs text-[#0a61d7] font-medium">
                      {selectedDateRanges.length} date range{selectedDateRanges.length !== 1 ? 's' : ''} selected
                    </div>
                  )}
                  {rangeTab === 'time' && selectedTimeSlots.length > 0 && (
                    <div className="text-xs text-[#0a61d7] font-medium">
                      {selectedTimeSlots.length} time slot{selectedTimeSlots.length !== 1 ? 's' : ''} selected
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex flex-col gap-3 p-4 border-t border-gray-200 text-sm flex-shrink-0 rounded-b-lg">
              {/* Validation Message */}
              {(selectedOfferTypes.length === 0 || (selectedDateRanges.length === 0 && selectedTimeSlots.length === 0)) && (
                <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2">
                  ⚠️ Please select at least one offer type and one active period (date range or time slot)
                </div>
              )}
              
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => {
                    setShowOfferModal(false);
                    // Reset selections
                    setSelectedOfferTypes([]);
                    setSelectedDateRanges([]);
                    setSelectedTimeSlots([]);
                  }}
                  className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  disabled={selectedOfferTypes.length === 0 || (selectedDateRanges.length === 0 && selectedTimeSlots.length === 0)}
                  onClick={() => {
                    // Validate selections
                    if (selectedOfferTypes.length === 0) {
                      alert('Please select at least one offer type');
                      return;
                    }
                    if (selectedDateRanges.length === 0 && selectedTimeSlots.length === 0) {
                      alert('Please select at least one active period (date range or time slot)');
                      return;
                    }
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
                  setSelectedTimeSlots([]);
                }}
                className={`flex items-center gap-2 px-6 py-2 rounded-lg transition-colors ${
                  selectedOfferTypes.length === 0 || (selectedDateRanges.length === 0 && selectedTimeSlots.length === 0)
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-[#0a61d7] text-white hover:bg-[#084ba6]'
                }`}
              >
                Apply Offer
              </button>
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
              <h3 className="text-lg font-semibold text-black">Remove Offer</h3>
            </div>
            <div className="p-4 space-y-2">
              <p className="text-sm text-gray-700">
                Are you sure you want to remove offers from {selectedProducts.filter(id => {
                  const p = products.find(pp => pp.productId === id);
                  return p?.hasOffer;
                }).length} selected product{selectedProducts.filter(id => {
                  const p = products.find(pp => pp.productId === id);
                  return p?.hasOffer;
                }).length !== 1 ? 's' : ''}?
              </p>
              <p className="text-xs text-gray-500">This action only affects products that currently have an offer.</p>
            </div>
            <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200">
              <button
                onClick={() => setShowRemoveConfirm(false)}
                className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (isBatchEditMode) {
                    // In batch edit mode, update parent state
                    const productsWithOffers = selectedProducts.filter(id => {
                      const p = products.find(pp => pp.productId === id);
                      return p?.hasOffer;
                    });
                    
                    const existingProducts = offerData?.products || [];
                    const updatedProducts = existingProducts.filter((p) => 
                      !productsWithOffers.includes(p.productId)
                    );
                    
                    // Update product offer badges
                    const updatedBadges = { ...productOfferBadges };
                    productsWithOffers.forEach(id => {
                      delete updatedBadges[id];
                    });
                    
                    onOfferChange!({ 
                      products: updatedProducts,
                      productOfferBadges: updatedBadges
                    });
                    
                    // First, clear the store badges for products in current offer
                    selectedProducts.forEach((productId) => {
                      if (currentOfferProductIds.has(productId)) {
                        clearProductOfferBadge(productId);
                      }
                    });
                    
                    // Update local UI - remove the offer badge for products in current offer
                    // Don't change hasOffer globally as product might have offers from other offers
                    setProducts((prev) => prev.map((p) => {
                      // If this product was in selectedProducts and is in current offer, remove only the badge
                      if (selectedProducts.includes(p.productId) && currentOfferProductIds.has(p.productId)) {
                        return { 
                          ...p, 
                          offerBadge: undefined,
                        };
                      }
                      return p;
                    }));
                    
                    // Update currentOfferProductIds to remove only the products that had offers
                    setCurrentOfferProductIds(prev => {
                      const newSet = new Set(prev);
                      productsWithOffers.forEach(id => newSet.delete(id));
                      return newSet;
                    });
                    
                    // Force re-render to ensure UI updates
                    setForceRender(prev => prev + 1);
                  } else {
                    // In create view, update local state - only remove the offer badge
                    // Don't change hasOffer globally as product might have offers from other offers
                    setProducts((prev) => prev.map((p) => {
                      // If this product was in selectedProducts and is in current offer, remove only the badge
                      if (selectedProducts.includes(p.productId) && currentOfferProductIds.has(p.productId)) {
                        return { 
                          ...p, 
                          offerBadge: undefined,
                          // Keep hasOffer as is - don't change it globally
                          // Only remove the offer badge for this specific offer
                        };
                      }
                      return p;
                    }));
                    
                    // Only clear badges for products that actually had offers
                    const productsWithOffersInCreate = selectedProducts.filter(id => {
                      const p = products.find(pp => pp.productId === id);
                      return p?.hasOffer;
                    });
                    productsWithOffersInCreate.forEach((id) => clearProductOfferBadge(id));
                    
                    // Update currentOfferProductIds to remove only the products that had offers
                    setCurrentOfferProductIds(prev => {
                      const newSet = new Set(prev);
                      productsWithOffersInCreate.forEach(id => newSet.delete(id));
                      return newSet;
                    });
                    
                    // Force re-render to ensure UI updates
                    setForceRender(prev => prev + 1);
                  }
                  setShowRemoveConfirm(false);
                  setSelectedProducts([]);
                }}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

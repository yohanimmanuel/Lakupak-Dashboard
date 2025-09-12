'use client';
import React from 'react';
import { X, Heart, Share2, Star, ShoppingCart, ArrowLeft, Zap } from 'lucide-react';
import { Product, ProductTableRow } from "@/types/product";
import { useUserStore } from '@/store/userStore';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';
import { useState, useEffect } from 'react';

interface ProductMarketplacePubsProps {
  product: ProductTableRow;
  isOpen: boolean;
  onClose: () => void;
  onPublish?: () => void;
  isBulkPublish?: boolean;
  selectedCount?: number;
  selectedProducts?: ProductTableRow[];
  allProducts?: Product[];
  isProductComplete?: (productId: string) => boolean;
}

export default function ProductMarketplacePubs({ 
  product, 
  isOpen, 
  onClose, 
  onPublish, 
  isBulkPublish = false, 
  selectedCount = 0, 
  selectedProducts = [], 
  allProducts = [], 
  isProductComplete 
}: ProductMarketplacePubsProps) {
  const user = useUserStore(state => state.user);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const userCurrency = isClient ? (user?.currency || getDefaultCurrency()) : getDefaultCurrency();
  if (!isOpen) return null;

  // Smart bulk publishing logic
  const completeProducts = isBulkPublish && isProductComplete 
    ? selectedProducts.filter(p => isProductComplete(p.productId))
    : [];
  
  const incompleteProducts = isBulkPublish && isProductComplete
    ? selectedProducts.filter(p => !isProductComplete(p.productId))
    : [];

  const canPublishCount = completeProducts.length;
  const blockedCount = incompleteProducts.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-100 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h2 className="text-lg font-semibold text-gray-900">
              {isBulkPublish ? `Bulk Publish (${selectedCount} products)` : 'Marketplace Preview'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Mobile App Preview */}
        <div className="overflow-y-auto max-h-[calc(90vh-150px)] hide-scrollbar">
          {/* Smart Bulk Publish Information */}
          {isBulkPublish && (
            <div className="mx-4 mb-4 space-y-3">
              {/* Publishable Products */}
              {canPublishCount > 0 && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center mt-0.5">
                      <span className="text-green-600 text-xs">✅</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-green-800 font-medium">
                        Ready to Publish ({canPublishCount} product{canPublishCount !== 1 ? 's' : ''})
                      </p>
                      <p className="text-xs text-green-700 mt-1">
                        These products have complete data and will be published to the marketplace.
                      </p>
                      {canPublishCount <= 3 && (
                        <div className="mt-2 space-y-1">
                          {completeProducts.map(product => (
                            <div key={product.productId} className="text-xs text-green-600 font-medium">
                              • {product.name || 'Unnamed Product'}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              
              {/* Incomplete Products */}
              {blockedCount > 0 && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <div className="w-5 h-5 bg-amber-100 rounded-full flex items-center justify-center mt-0.5">
                      <span className="text-amber-600 text-xs">⚠️</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-amber-800 font-medium">
                        Cannot Publish ({blockedCount} product{blockedCount !== 1 ? 's' : ''})
                      </p>
                      <p className="text-xs text-amber-700 mt-1">
                        These products have incomplete data and will be skipped. Complete the missing fields to publish them later.
                      </p>
                      {blockedCount <= 3 && (
                        <div className="mt-2 space-y-1">
                          {incompleteProducts.map(product => {
                            const originalProduct = allProducts.find(p => p.productId === product.productId);
                            const missingFields = [];
                            if (originalProduct) {
                              if (!String(originalProduct.sku).trim()) missingFields.push('SKU');
                              if (!String(originalProduct.name).trim()) missingFields.push('Name');
                              if (!String(originalProduct.description).trim()) missingFields.push('Description');
                              if (!String(originalProduct.category).trim()) missingFields.push('Category');
                              if (!String(originalProduct.brand).trim()) missingFields.push('Brand');
                              if (!String(originalProduct.supplier).trim()) missingFields.push('Supplier');
                              if (!String(originalProduct.purchasePrice).trim()) missingFields.push('Purchase Price');
                              if (!String(originalProduct.sellingPrice).trim()) missingFields.push('Selling Price');
                              if (originalProduct.stockQuantity === undefined || originalProduct.stockQuantity === null) missingFields.push('Stock');
                            }
                            
                            return (
                              <div key={product.productId} className="text-xs text-amber-600">
                                <div className="font-medium">• {product.name || 'Unnamed Product'}</div>
                                {missingFields.length > 0 && (
                                  <div className="text-amber-500 ml-2">Missing: {missingFields.join(', ')}</div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {blockedCount > 3 && (
                        <div className="mt-2 text-xs text-amber-600">
                          And {blockedCount - 3} more products with incomplete data...
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              
              {/* No Complete Products Warning */}
              {canPublishCount === 0 && blockedCount > 0 && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <div className="w-5 h-5 bg-red-100 rounded-full flex items-center justify-center mt-0.5">
                      <span className="text-red-600 text-xs">❌</span>
                    </div>
                    <div>
                      <p className="text-sm text-red-800 font-medium">No Products Ready for Publishing</p>
                      <p className="text-xs text-red-700 mt-1">
                        All selected products have incomplete data. Please complete the required fields before publishing.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          
          <div className="text-center mb-4 p-4">
             <p className="text-sm text-gray-600 mb-2">This is how your products will appear to customers:</p>
             <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
               📱 Laku-Laku Marketplace App
             </div>
           </div>

           {/* Marketplace App Container with Rounded Borders */}
           <div className="mx-4 mb-4 border-2 border-gray-200 rounded-2xl overflow-hidden">

          {/* 1. PRODUCT IMAGE CAROUSEL & HIGHLIGHTS */}
          <div className="relative">
            {/* Product Image Carousel */}
            <div className="relative h-64 bg-gradient-to-br from-gray-100 to-gray-200">
              {/* Template Product Image Placeholder */}
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-gray-400 text-center">
                  <div className="w-20 h-20 bg-gray-200 rounded-lg mb-2 mx-auto"></div>
                  <p className="text-sm">Product Image</p>
                </div>
              </div>
              
              {/* Action Buttons */}
              <div className="absolute top-3 right-3 flex flex-col gap-2">
                <button className="w-8 h-8 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:bg-white transition-colors">
                  <Heart className="w-4 h-4 text-gray-600" />
                </button>
                <button className="w-8 h-8 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:bg-white transition-colors">
                  <Share2 className="w-4 h-4 text-gray-600" />
                </button>
              </div>

              {/* Image Indicator Dots */}
              <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2 flex gap-1">
                <div className="w-2 h-2 bg-white rounded-full"></div>
                <div className="w-2 h-2 bg-white/50 rounded-full"></div>
                <div className="w-2 h-2 bg-white/50 rounded-full"></div>
              </div>
            </div>

            
          </div>

          {/* 2. CORE PRODUCT INFORMATION */}
          <div className="p-4 border-b border-gray-100">
                         {/* Product Name & Rating */}
             <div className="mb-3">
               <div className="flex items-center gap-2 mb-2">
                 <h3 className="text-lg font-semibold text-gray-900">Sample Premium Product Name</h3>
                 <div className="px-2 py-1 bg-green-500 text-white text-xs font-bold rounded-lg">BEST SELLER</div>
               </div>
               <div className="flex items-center gap-2 mb-2">
                 <div className="flex items-center gap-1">
                   <Star className="w-4 h-4 text-yellow-400 fill-current" />
                   <span className="text-sm font-medium text-gray-700">4.8</span>
                 </div>
                 <span className="text-sm text-gray-500">(127 reviews)</span>
                 <span className="text-xs text-gray-400">•</span>
                 <span className="text-sm text-gray-500">Terjual 2.5rb+</span>
               </div>
             </div>

            {/* Pricing with Discount */}
            <div className="mb-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold text-[#0a61d7]">
                  {formatCurrency(150000, userCurrency)}
                </span>
                <span className="text-lg text-gray-500 line-through">
                  {formatCurrency(200000, userCurrency)}
                </span>
                <span className="px-2 py-1 bg-red-100 text-red-600 text-xs font-bold rounded">
                  -25%
                </span>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Free shipping for orders above {formatCurrency(500000, userCurrency)}
              </div>
            </div>

            {/* Stock Status */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Stock:</span>
              <span className="text-sm font-medium text-green-600">In Stock (150 units)</span>
            </div>
          </div>

          {/* 3. PRODUCT DETAILS */}
          <div className="p-4 border-b border-gray-100">
            <h4 className="font-semibold text-gray-900 mb-3">Product Details</h4>
            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Brand:</span>
                <span className="text-sm font-medium text-gray-900">Sample Brand</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Category:</span>
                <span className="text-sm font-medium text-gray-900">Sample Category</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Unit:</span>
                <span className="text-sm font-medium text-gray-900">Piece</span>
              </div>
            </div>

            {/* Description */}
            <div>
              <h5 className="text-sm font-medium text-gray-900 mb-2">Description</h5>
              <p className="text-sm text-gray-600 leading-relaxed">
                This is a sample product description that shows how your product information will be displayed to customers in the Laku-Laku marketplace app. The description will include all the details you've provided about your product, features, specifications, and benefits.
              </p>
            </div>
          </div>

          {/* 4. PRODUCT ASSURANCE */}
          <div className="p-4 border-b border-gray-100">
            <h4 className="font-semibold text-gray-900 mb-3">Product Assurance</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 p-2 bg-green-50 rounded-lg">
                <span className="text-green-600">✅</span>
                <span className="text-sm font-medium text-green-700">Halal Certified</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg">
                <span className="text-blue-600">🏛️</span>
                <span className="text-sm font-medium text-blue-700">BPOM Approved</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-purple-50 rounded-lg">
                <span className="text-purple-600">🔒</span>
                <span className="text-sm font-medium text-purple-700">Original Product</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-orange-50 rounded-lg">
                <span className="text-orange-600">↩️</span>
                <span className="text-sm font-medium text-orange-700">7 Days Return</span>
              </div>
            </div>
          </div>

          {/* 5. CUSTOMER REVIEWS */}
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-gray-900">Customer Reviews</h4>
              <button className="text-sm text-[#0a61d7]">View All (127)</button>
            </div>
            
            {/* Rating Breakdown */}
            <div className="flex items-center gap-4 mb-3">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">4.8</div>
                <div className="flex items-center gap-1 mb-1">
                  {[1,2,3,4,5].map((star) => (
                    <Star key={star} className="w-4 h-4 text-yellow-400 fill-current" />
                  ))}
                </div>
                <div className="text-xs text-gray-500">127 reviews</div>
              </div>
              <div className="flex-1 space-y-1">
                {[5,4,3,2,1].map((rating) => (
                  <div key={rating} className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-4">{rating}⭐</span>
                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-yellow-400 h-2 rounded-full" 
                        style={{ width: `${rating === 5 ? 80 : rating === 4 ? 15 : rating === 3 ? 3 : rating === 2 ? 1 : 1}%` }}
                      ></div>
                    </div>
                    <span className="text-xs text-gray-500 w-8">
                      {rating === 5 ? '102' : rating === 4 ? '19' : rating === 3 ? '4' : rating === 2 ? '1' : '1'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Sample Review */}
            <div className="border-t border-gray-100 pt-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                  <span className="text-gray-600 text-xs font-medium">JD</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex items-center gap-1">
                      {[1,2,3,4,5].map((star) => (
                        <Star key={star} className="w-3 h-3 text-yellow-400 fill-current" />
                      ))}
                    </div>
                    <span className="text-xs text-gray-500">John Doe</span>
                    <span className="text-xs text-gray-400">2 days ago</span>
                  </div>
                  <p className="text-sm text-gray-700">
                    "Excellent product quality! Fast delivery and great customer service. Highly recommended!"
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 6. SELLER INFORMATION */}
          <div className="p-4 border-b border-gray-100 bg-gray-50">
            <h4 className="font-semibold text-gray-900 mb-3">Seller Information</h4>
              <div className="flex items-center gap-3 mb-3">
               <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                 <span className="text-blue-600 font-bold text-sm">L</span>
               </div>
               <div>
                 <div className="flex items-center gap-2 mb-1">
                   <p className="font-medium text-gray-900">Laku-Laku Official Store</p>
                   <div className="px-2 py-1 bg-blue-500 text-white text-xs font-bold rounded-lg">OFFICIAL STORE</div>
                 </div>
                 <div className="flex items-center gap-2">
                   <Star className="w-3 h-3 text-yellow-400 fill-current" />
                   <span className="text-xs text-gray-600">4.9 (2.1k+ ratings)</span>
                 </div>
               </div>
             </div>
            <div className="grid grid-cols-3 gap-4 text-center text-xs">
              <div>
                <p className="text-gray-600">Response Time</p>
                <p className="font-medium text-gray-900">1-2 hours</p>
              </div>
              <div>
                <p className="text-gray-600">Delivery Speed</p>
                <p className="font-medium text-gray-900">1-3 days</p>
              </div>
              <div>
                <p className="text-gray-600">Return Policy</p>
                <p className="font-medium text-gray-900">7 days</p>
              </div>
            </div>
          </div>

          {/* 7. LOGISTICS & SHIPPING */}
          <div className="p-4 border-b border-gray-100">
            <h4 className="font-semibold text-gray-900 mb-3">Shipping & Delivery</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2 bg-green-50 rounded-lg">
                <div className="flex items-center gap-2 text-green-600">
                  <span className="text-green-600">🚚</span>
                  <span className="text-sm font-medium">Standard Shipping</span>
                </div>
                <span className="text-sm text-gray-600">Free</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-blue-50 rounded-lg">
                <div className="flex items-center gap-2 text-blue-600">
                  <span className="text-blue-600">⚡</span>
                  <span className="text-sm font-medium">Express Shipping</span>
                </div>
                <span className="text-sm text-gray-600">{formatCurrency(15000, userCurrency)}</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-purple-50 rounded-lg">
                <div className="flex items-center gap-2 text-purple-600">
                  <span className="text-purple-600">🏃</span>
                  <span className="text-sm font-medium">Same Day Delivery</span>
                </div>
                <span className="text-sm text-gray-600">{formatCurrency(25000, userCurrency)}</span>
              </div>
            </div>
          </div>

          {/* 8. CTA BUTTONS */}
          <div className="p-4">
            <div className="flex gap-3">
              <button className="flex-1 bg-[#0a61d7] text-white py-3 px-4 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2">
                <ShoppingCart className="w-5 h-5" />
                Add to Cart
              </button>
              <button className="flex-1 bg-green-600 text-white py-3 px-4 rounded-lg font-semibold transition-colors">
                Buy Now
              </button>
            </div>
            <div className="mt-3">
              <button className="w-full bg-gray-100 text-gray-700 py-3 px-4 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2">
                💬 Chat Seller
              </button>
            </div>
          </div>
          </div>

           {/* Template Note */}
           <div className="mx-4 mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
             <div className="flex items-start gap-2">
               <div className="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center mt-0.5">
                 <span className="text-blue-600 text-xs">ℹ</span>
               </div>
               <div>
                 <p className="text-sm text-blue-800 font-medium">Complete Marketplace Template</p>
                 <p className="text-xs text-blue-700 mt-1">
                   This shows the comprehensive design template that will be applied to all your published products in the Laku-Laku marketplace app. Your actual product details, images, pricing, and seller information will replace these sample placeholders.
                 </p>
               </div>
             </div>
           </div>
        </div>
        

      {/* Sticky Action Buttons */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4">
        <div className="flex gap-3">
          <button 
            onClick={onClose} 
            className="flex-1 bg-gray-100 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-200 transition-colors">
            Cancel
          </button>
          <button 
            onClick={onPublish}
            disabled={isBulkPublish && canPublishCount === 0}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-semibold transition-colors ${
              isBulkPublish && canPublishCount === 0
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            <Zap className="w-4 h-4" />
            {isBulkPublish 
              ? canPublishCount === 0 
                ? 'No Products to Publish'
                : `Publish ${canPublishCount} Product${canPublishCount !== 1 ? 's' : ''}`
              : 'Publish'
            }
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}

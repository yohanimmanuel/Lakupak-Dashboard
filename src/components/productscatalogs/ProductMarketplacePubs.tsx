'use client';
import React from 'react';
import {
  X,
  Heart,
  Share2,
  Star,
  ShoppingCart,
  ArrowLeft,
  Zap,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Building2,
  Lock,
  Undo2,
  MessageCircle,
  Info,
  BadgeCheck,
} from 'lucide-react';
import { Product, ProductTableRow } from "@/types/product";
import { useUserStore } from '@/store/userStore';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';
import { formatNumberByCurrency, parseNumberByCurrency } from '@/config/currencyConfig';
import { useState } from 'react';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useProductsTranslations } from '@/hooks/useProductsTranslations';
import { getProductCompletion } from '@/utils/productCompletion';

const PUBLISH_MARKETPLACE_MUTATION = `
  mutation PublishMarketplaceProduct($userId: Int!, $productId: String!, $action: String!) {
    publishMarketplaceProduct(userId: $userId, productId: $productId, action: $action) {
      success
      message
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
  const { tMarketplace, tCatalog, translateFieldName } = useProductsTranslations();
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const userCurrency = user?.currency || getDefaultCurrency();

  const translateMissingField = (field: string) =>
    tMarketplace.has(`missingFields.${field}` as 'missingFields.SKU')
      ? tMarketplace(`missingFields.${field}` as 'missingFields.SKU')
      : field;
  
  // Handle publish to marketplace
  const handlePublish = async () => {
    try {
      setPublishing(true);
      setError('');
      
      if (!user?.id) {
        throw new Error(tMarketplace('userNotAuthenticated'));
      }
      
      if (isBulkPublish) {
        // Bulk publish - use single bulk mutation to avoid browser connection limits
        const productIds = completeProducts.map(p => p.productId);
        
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
            action: 'publish',
          });
          
        if (!result.bulkPublishMarketplaceProducts?.success && result.bulkPublishMarketplaceProducts?.failed.length > 0) {
            throw new Error(
            result.bulkPublishMarketplaceProducts.message || tMarketplace('bulkPublishFailed', { count: result.bulkPublishMarketplaceProducts.failed.length })
            );
          }
      } else {
        // Single product publish - check if product is complete
        if (isProductComplete && !isProductComplete(product.productId)) {
          throw new Error(tMarketplace('incompleteData'));
        }
        
        const result = await fetchGraphQL<{
          publishMarketplaceProduct: { success: boolean; message: string };
        }>(PUBLISH_MARKETPLACE_MUTATION, {
          userId: user.id,
            productId: product.productId,
          action: 'publish',
        });
        
        if (!result.publishMarketplaceProduct?.success) {
          throw new Error(
            result.publishMarketplaceProduct?.message || tMarketplace('publishFailed'),
          );
        }
      }
      
      if (onPublish) {
        onPublish();
      }
      
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 2000);
    } catch (error) {
      setError(error instanceof Error ? error.message : tMarketplace('publishError'));
    } finally {
      setPublishing(false);
    }
  };
  
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
      <div className="bg-white rounded-2xl border border-[#e6e6e6] w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#e6e6e6]">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-100 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h2 className="text-lg font-semibold text-gray-900">
              {isBulkPublish ? tMarketplace('bulkPublishTitle', { count: selectedCount }) : tMarketplace('title')}
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
        <div className="overflow-y-auto max-h-[calc(90vh-150px)]">
          {/* Single Product Incomplete Warning */}
          {!isBulkPublish && isProductComplete && !isProductComplete(product.productId) && (() => {
            const originalProduct = allProducts.find(p => p.productId === product.productId);
            const completion = originalProduct
              ? getProductCompletion(originalProduct, undefined, userCurrency, {
                  requirePositiveStock: true,
                  requirePositivePrice: true,
                })
              : null;
            return (
              <div className="mx-4 mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  <p className="text-sm text-amber-800 font-medium">{tMarketplace('incompleteWarningTitle')}</p>
                </div>
                <p className="text-xs text-amber-700 mt-1">
                  {tMarketplace('incompleteWarningBody')}
                </p>
                {completion && completion.missingFieldKeys.length > 0 && (
                  <p className="text-xs font-semibold text-amber-800 mt-1.5">
                    {tCatalog('completion.missing', { fields: completion.missingFieldKeys.map(k => translateFieldName(k)).join(', ') })}
                  </p>
                )}
              </div>
            );
          })()}

          {/* Smart Bulk Publish Information */}
          {isBulkPublish && (
            <div className="mx-4 mb-4 mt-2 space-y-3">
              {/* Publishable Products */}
              {canPublishCount > 0 && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center mt-0.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-green-800 font-medium">
                        {canPublishCount === 1
                          ? tMarketplace('readyToPublish', { count: canPublishCount })
                          : tMarketplace('readyToPublishPlural', { count: canPublishCount })}
                      </p>
                      <p className="text-xs text-green-700 mt-1">
                        {tMarketplace('readyToPublishBody')}
                      </p>
                      {canPublishCount <= 3 && (
                        <div className="mt-2 space-y-1">
                          {completeProducts.map(product => (
                            <div key={product.productId} className="text-xs text-green-600 font-medium">
                              • {product.name || tMarketplace('unnamedProduct')}
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
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-amber-800 font-medium">
                        {blockedCount === 1
                          ? tMarketplace('cannotPublish', { count: blockedCount })
                          : tMarketplace('cannotPublishPlural', { count: blockedCount })}
                      </p>
                      <p className="text-xs text-amber-700 mt-1">
                        {tMarketplace('cannotPublishBody')}
                      </p>
                      {blockedCount <= 3 && (
                        <div className="mt-2 space-y-1">
                          {incompleteProducts.map(product => {
                            const originalProduct = allProducts.find(p => p.productId === product.productId);
                            const completion = originalProduct
                              ? getProductCompletion(originalProduct, undefined, userCurrency, {
                                  requirePositiveStock: true,
                                  requirePositivePrice: true,
                                })
                              : null;
                            const missingFields = completion 
                              ? completion.missingFieldKeys.map(k => translateFieldName(k))
                              : [];
                            
                            return (
                              <div key={product.productId} className="text-xs text-amber-600">
                                <div className="font-medium">• {product.name || tMarketplace('unnamedProduct')}</div>
                                {missingFields.length > 0 && (
                                  <div className="text-amber-500 ml-2">
                                    {tMarketplace('missing', { fields: missingFields.join(', ') })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {blockedCount > 3 && (
                        <div className="mt-2 text-xs text-amber-600">
                          {tMarketplace('andMoreIncomplete', { count: blockedCount - 3 })}
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
                      <XCircle className="w-3.5 h-3.5 text-red-600" />
                    </div>
                    <div>
                      <p className="text-sm text-red-800 font-medium">{tMarketplace('noProductsReady')}</p>
                      <p className="text-xs text-red-700 mt-1">
                        {tMarketplace('noProductsReadyBody')}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          
          <div className="text-center mb-4 p-4">
             <p className="text-sm text-gray-600 mb-2">{tMarketplace('previewIntro')}</p>
             <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                {tMarketplace('marketplaceApp')}
             </div>
           </div>

           {/* Marketplace App Container with Rounded Borders */}
           <div className="mx-4 mb-4 border-2 border-[#e6e6e6] rounded-2xl overflow-hidden">

          {/* 1. PRODUCT IMAGE CAROUSEL & HIGHLIGHTS */}
          <div className="relative">
            {/* Product Image Carousel */}
            <div className="relative h-64 bg-gradient-to-br from-gray-100 to-gray-200">
              {/* Template Product Image Placeholder */}
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-gray-400 text-center">
                  <div className="w-20 h-20 bg-gray-200 rounded-lg mb-2 mx-auto"></div>
                  <p className="text-sm">{tMarketplace('productImage')}</p>
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
          <div className="p-4 border-b border-[#e6e6e6]">
                         {/* Product Name & Rating */}
             <div className="mb-3">
               <div className="flex items-center gap-2 mb-2">
                 <h3 className="text-lg font-semibold text-gray-900">{tMarketplace('sampleProductName')}</h3>
                 <div className="px-2 py-1 bg-green-500 text-white text-xs font-bold rounded-lg">{tMarketplace('bestSeller')}</div>
               </div>
               <div className="flex items-center gap-2 mb-2">
                 <div className="flex items-center gap-1">
                   <Star className="w-4 h-4 text-yellow-400 fill-current" />
                   <span className="text-sm font-medium text-gray-700">4.8</span>
                 </div>
                 <span className="text-sm text-gray-500">{tMarketplace('reviews', { count: 127 })}</span>
                 <span className="text-xs text-gray-400">•</span>
                 <span className="text-sm text-gray-500">{tMarketplace('soldCount')}</span>
               </div>
             </div>

            {/* Pricing with Discount */}
            <div className="mb-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold text-[#0a61d7]">
                  {formatCurrency(15000, userCurrency)}
                </span>
                <span className="text-lg text-gray-500 line-through">
                  {formatCurrency(20000, userCurrency)}
                </span>
                <span className="px-2 py-1 bg-red-100 text-red-600 text-xs font-bold rounded">
                  {tMarketplace('percentOff', { percent: 25 })}
                </span>
              </div>
              
              
              <div className="text-xs text-gray-500 mt-1">
                {tMarketplace('shippingNote')}
              </div>
            </div>

            {/* Stock Status */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">{tMarketplace('stock')}</span>
              <span className="text-sm font-medium text-green-600">
                {tMarketplace('inStockUnits', { count: 150 })}
              </span>
            </div>
          </div>

          {/* 3. PRODUCT DETAILS */}
          <div className="p-4 border-b border-[#e6e6e6]">
            <h4 className="font-semibold text-gray-900 mb-3">{tMarketplace('productDetails')}</h4>
            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{tMarketplace('brand')}</span>
                <span className="text-sm font-medium text-gray-900">{tMarketplace('sampleBrand')}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{tMarketplace('type')}</span>
                <span className="text-sm font-medium text-gray-900">{tMarketplace('sampleType')}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{tMarketplace('category')}</span>
                <span className="text-sm font-medium text-gray-900">{tMarketplace('sampleCategory')}</span>
              </div>
            </div>

            {/* Description */}
            <div>
              <h5 className="text-sm font-medium text-gray-900 mb-2">{tMarketplace('description')}</h5>
              <p className="text-sm text-gray-600 leading-relaxed">
                {tMarketplace('sampleDescription')}
              </p>
            </div>
          </div>

          {/* 4. PRODUCT ASSURANCE */}
          <div className="p-4 border-b border-[#e6e6e6]">
            <h4 className="font-semibold text-gray-900 mb-3">{tMarketplace('productAssurance')}</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 p-2 bg-green-50 rounded-lg">
                <BadgeCheck className="w-4 h-4 text-green-600 shrink-0" />
                <span className="text-sm font-medium text-green-700">{tMarketplace('halalCertified')}</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg">
                <Building2 className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="text-sm font-medium text-blue-700">{tMarketplace('bpomApproved')}</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-purple-50 rounded-lg">
                <Lock className="w-4 h-4 text-purple-600 shrink-0" />
                <span className="text-sm font-medium text-purple-700">{tMarketplace('originalProduct')}</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-orange-50 rounded-lg">
                <Undo2 className="w-4 h-4 text-orange-600 shrink-0" />
                <span className="text-sm font-medium text-orange-700">{tMarketplace('daysReturn', { days: 7 })}</span>
              </div>
            </div>
          </div>

          {/* 5. CUSTOMER REVIEWS */}
          <div className="p-4 border-b border-[#e6e6e6]">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-gray-900">{tMarketplace('customerReviews')}</h4>
              <button className="text-sm text-[#0a61d7]">{tMarketplace('viewAllReviews', { count: 127 })}</button>
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
                <div className="text-xs text-gray-500">{tMarketplace('reviewsCount', { count: 127 })}</div>
              </div>
              <div className="flex-1 space-y-1">
                {[5,4,3,2,1].map((rating) => (
                  <div key={rating} className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-4 inline-flex items-center gap-0.5">
                      {rating}
                      <Star className="w-3 h-3 text-yellow-400 fill-current" />
                    </span>
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
            <div className="border-t border-[#e6e6e6] pt-3">
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
                    {tMarketplace('sampleReview')}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 6. SELLER INFORMATION */}
          <div className="p-4 border-b border-[#e6e6e6] bg-gray-50">
            <h4 className="font-semibold text-gray-900 mb-3">{tMarketplace('sellerInformation')}</h4>
              <div className="flex items-center gap-3 mb-3">
               <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                 <span className="text-blue-600 font-bold text-sm">L</span>
               </div>
               <div>
                 <div className="flex items-center gap-2 mb-1">
                   <p className="font-medium text-gray-900">{tMarketplace('officialStore')}</p>
                   <div className="px-2 py-1 bg-blue-500 text-white text-xs font-bold rounded-lg">{tMarketplace('officialStoreBadge')}</div>
                 </div>
                 <div className="flex items-center gap-2">
                   <Star className="w-3 h-3 text-yellow-400 fill-current" />
                   <span className="text-xs text-gray-600">{tMarketplace('storeRatings')}</span>
                 </div>
               </div>
             </div>
          </div>

          {/* 8. CTA BUTTONS */}
          <div className="p-4">
            <div className="flex gap-2">
              <button className="flex-1 bg-gray-100 text-gray-800 py-1 px-2 rounded-lg font-semibold transition-colors flex flex-col items-center justify-center gap-1">
                <MessageCircle className="w-4 h-4" />
                <span className="text-xs">{tMarketplace('chatNow')}</span>
              </button>
              <button className="flex-1 bg-[#0a61d7] text-white py-1 px-2 rounded-lg font-semibold transition-colors flex flex-col items-center justify-center gap-1">
                <ShoppingCart className="w-4 h-4" />
                <span className="text-xs">{tMarketplace('addToCart')}</span>
              </button>
              <button className="flex-[2] bg-green-600 text-white py-1 px-4 rounded-lg font-semibold transition-colors">
                {tMarketplace('buyNow')}
              </button>
            </div>
          </div>
          </div>

           {/* Template Note */}
           <div className="mx-4 mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
             <div className="flex items-start gap-2">
               <div className="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center mt-0.5">
                 <Info className="w-3.5 h-3.5 text-blue-600" />
               </div>
               <div>
                 <p className="text-sm text-blue-800 font-medium">{tMarketplace('templateTitle')}</p>
                 <p className="text-xs text-blue-700 mt-1">
                   {tMarketplace('templateBody')}
                 </p>
               </div>
             </div>
           </div>
        </div>
        

      {/* Error/Success Messages */}
      {error && (
        <div className="mx-4 mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <span className="text-red-700 text-sm">{error}</span>
        </div>
      )}
      
      {success && (
        <div className="mx-4 mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
          <span className="text-green-700 text-sm">{tMarketplace('publishSuccess')}</span>
        </div>
      )}

      {/* Sticky Action Buttons */}
      <div className="sticky bottom-0 bg-white border-t border-[#e6e6e6] p-4">
        <div className="flex gap-3">
          <button 
            onClick={onClose} 
            className="flex-1 bg-gray-100 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-200 transition-colors">
            {tMarketplace('cancel')}
          </button>
          <button 
            onClick={handlePublish}
            disabled={
              (isBulkPublish && canPublishCount === 0) || 
              (!isBulkPublish && isProductComplete && !isProductComplete(product.productId)) ||
              publishing
            }
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-semibold transition-colors ${
              (isBulkPublish && canPublishCount === 0) || 
              (!isBulkPublish && isProductComplete && !isProductComplete(product.productId)) ||
              publishing
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            <Zap className="w-4 h-4" />
            {publishing 
              ? tMarketplace('publishing')
              : isBulkPublish 
                ? canPublishCount === 0
                  ? tMarketplace('noProductsToPublish')
                  : canPublishCount === 1
                    ? tMarketplace('publishCount', { count: canPublishCount })
                    : tMarketplace('publishCountPlural', { count: canPublishCount })
                : tMarketplace('publish')
            }
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}

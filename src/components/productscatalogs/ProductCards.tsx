'use client';
import React from "react";
import { Package, CheckCircle, AlertTriangle, XCircle, X, Gift } from "lucide-react";
import { Product } from "@/types/product";
import { useProductsTranslations } from '@/hooks/useProductsTranslations';
import {
  STAT_ICON_BG_BLUE,
  STAT_ICON_BG_GREEN,
  STAT_ICON_BLUE,
  STAT_ICON_GREEN,
} from '@/utils/statCardStyles';

interface ProductCardsProps {
  products: Product[];
}

export default function ProductCards({ products = [] }: ProductCardsProps) {
  const { tCards } = useProductsTranslations();
  const [dismissedLowStock, setDismissedLowStock] = React.useState(false);
  const [dismissedOutOfStock, setDismissedOutOfStock] = React.useState(false);

  const totalProducts = products.length;
  const activeProducts = products.filter(product => product.status === 'Published').length;
  const lowStockAlerts = products.filter(product => {
    const legacyVariants = (product as unknown as { legacyVariants?: Array<{ stockQuantity?: number; lowStockThreshold?: number }> })
      .legacyVariants;
    const totalStock =
      (product.variantOptions?.reduce((sum, option) => sum + (option.stockQuantity || 0), 0) || 0) +
      (legacyVariants?.reduce((sum, v) => sum + (v.stockQuantity || 0), 0) || 0);
    const totalLowStockThreshold = Math.max(
      product.variantOptions?.reduce((max, option) => Math.max(max, option.lowStockThreshold || 0), 0) || 0,
      legacyVariants?.reduce((max, v) => Math.max(max, v.lowStockThreshold || 0), 0) || 0,
    );
    
    return totalStock > 0 && totalLowStockThreshold > 0 && totalStock <= totalLowStockThreshold;
  }).length;
  const outOfStock = products.filter(product => {
    const legacyVariants = (product as unknown as { legacyVariants?: Array<{ stockQuantity?: number }> }).legacyVariants;
    const totalStock =
      (product.variantOptions?.reduce((sum, option) => sum + (option.stockQuantity || 0), 0) || 0) +
      (legacyVariants?.reduce((sum, v) => sum + (v.stockQuantity || 0), 0) || 0);
    return totalStock === 0;
  }).length;
  const productsWithOffers = products.filter(product => 
    product.hasActiveOffer || 
    product.offerBadge || 
    product.originalPrice || 
    product.offerName || 
    product.discountType ||
    product.promotionDetails
  ).length;

  const stats = [
    {
      label: tCards('totalProducts'),
      value: totalProducts,
      icon: <Package className={`w-6 h-6 ${STAT_ICON_BLUE}`} />,
      color: STAT_ICON_BG_BLUE,
    },
    {
      label: tCards('publishedProducts'),
      value: activeProducts,
      icon: <CheckCircle className={`w-6 h-6 ${STAT_ICON_GREEN}`} />,
      color: STAT_ICON_BG_GREEN,
    },
    {
      label: tCards('productsWithOffers'),
      value: productsWithOffers,
      icon: <Gift className={`w-6 h-6 ${STAT_ICON_BLUE}`} />,
      color: STAT_ICON_BG_BLUE,
    }
  ];

  return (
    <div className="mx-auto w-full min-w-0 space-y-4">
      <div className="grid grid-cols-1 gap-3 @3xl/main:grid-cols-2 @5xl/main:grid-cols-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex min-w-0 items-center gap-4 rounded-lg border border-[#e6e6e6] bg-white p-4"
          >
            <div className={`flex items-center justify-center w-12 h-12 rounded-lg ${stat.color}`}>
              {stat.icon}
            </div>
            <div>
              <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{stat.label}</div>
              <div className="text-xl font-bold text-black">{stat.value}</div>
            </div>
          </div>
        ))}
      </div>

             {lowStockAlerts > 0 && !dismissedLowStock && (
         <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
           <div className="flex items-center justify-between">
             <div className="flex items-center gap-3">
               <AlertTriangle className="w-5 h-5 text-orange-500" />
               <div>
                 <div className="text-sm font-semibold text-orange-800">
                   {tCards(lowStockAlerts === 1 ? 'lowStockAlert' : 'lowStockAlertPlural', {
                     count: lowStockAlerts,
                   })}
                 </div>
               </div>
             </div>
             <button
               type="button"
               onClick={() => setDismissedLowStock(true)}
               className="text-orange-400 hover:text-orange-600"
               aria-label="Dismiss"
             >
               <X className="w-4 h-4" />
             </button>
           </div>
         </div>
       )}

             {outOfStock > 0 && !dismissedOutOfStock && (
         <div className="bg-red-50 border border-red-200 rounded-lg p-3">
           <div className="flex items-center justify-between">
             <div className="flex items-center gap-3">
               <XCircle className="w-5 h-5 text-red-500" />
               <div>
                 <div className="text-sm font-semibold text-red-800">
                   {tCards(outOfStock === 1 ? 'outOfStockAlert' : 'outOfStockAlertPlural', {
                     count: outOfStock,
                   })}
                 </div>
               </div>
             </div>
             <button
               type="button"
               onClick={() => setDismissedOutOfStock(true)}
               className="text-red-400 hover:text-red-600"
               aria-label="Dismiss"
             >
               <X className="w-4 h-4" />
             </button>
           </div>
         </div>
       )}
    </div>
  );
}

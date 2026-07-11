'use client';
import React from "react";
import { Package, CheckCircle, AlertTriangle, XCircle, X, Gift } from "lucide-react";
import { Product } from "@/types/product";
import { cumulativeCountGrowth, formatLegacyTrend } from "@/utils/monthOverMonthGrowth";
import { StatCardTrendRow } from "@/components/stats/StatCardTrendRow";
import { useProductsTranslations } from '@/hooks/useProductsTranslations';

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

  const totalProductsGrowth = cumulativeCountGrowth(products, (product) => product.createdAt);
  const unavailableTrend = formatLegacyTrend(null);

  const stats = [
    {
      label: tCards('totalProducts'),
      value: totalProducts,
      icon: <Package className="w-6 h-6 text-[#0a61d7]" />,
      color: 'bg-[#f7faff]',
      trend: formatLegacyTrend(totalProductsGrowth),
    },
    {
      label: tCards('publishedProducts'),
      value: activeProducts,
      icon: <CheckCircle className="w-6 h-6 text-green-500" />,
      color: 'bg-[#e6f7ec]',
      trend: unavailableTrend,
    },
    {
      label: tCards('productsWithOffers'),
      value: productsWithOffers,
      icon: <Gift className="w-6 h-6 text-purple-500" />,
      color: 'bg-[#f3e8ff]',
      trend: unavailableTrend,
    }
  ];

  return (
    <div className="w-full mx-auto space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"> 
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex flex-col justify-between p-4 rounded-lg bg-white border border-[#e6e6e6]"
          >
            <div className="flex items-center gap-4 border-b border-[#e6e6e6] pb-4">
              <div className={`flex items-center justify-center w-12 h-12 rounded-lg ${stat.color}`}>
                {stat.icon}
              </div>
              <div>
                <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{stat.label}</div>
                <div className="text-xl font-bold text-black">{stat.value}</div>
              </div>
            </div>
            <StatCardTrendRow trend={stat.trend} />
          </div>
        ))}
      </div>

             {lowStockAlerts > 0 && !dismissedLowStock && (
         <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
           <div className="flex items-center justify-between">
             <div className="flex items-center gap-3">
               <AlertTriangle className="w-5 h-5 text-orange-600" />
               <span className="text-sm text-orange-700 font-medium">
                 {lowStockAlerts > 1
                   ? tCards('lowStockAlertPlural', { count: lowStockAlerts })
                   : tCards('lowStockAlert', { count: lowStockAlerts })}
               </span>
             </div>
             <button
               onClick={() => setDismissedLowStock(true)}
               className="p-1 hover:bg-orange-100 rounded-full transition-colors"
               title={tCards('dismissNotification')}
             >
               <X className="w-4 h-4 text-orange-600" />
             </button>
           </div>
         </div>
       )}

             {outOfStock > 0 && !dismissedOutOfStock && (
         <div className="bg-red-50 border border-red-200 rounded-lg p-3">
           <div className="flex items-center justify-between">
             <div className="flex items-center gap-3">
               <XCircle className="w-5 h-5 text-red-600" />
               <span className="text-sm text-red-700 font-medium">
                 {outOfStock > 1
                   ? tCards('outOfStockAlertPlural', { count: outOfStock })
                   : tCards('outOfStockAlert', { count: outOfStock })}
             </span>
             </div>
             <button
               onClick={() => setDismissedOutOfStock(true)}
               className="p-1 hover:bg-red-100 rounded-full transition-colors"
               title={tCards('dismissNotification')}
             >
               <X className="w-4 h-4 text-red-600" />
             </button>
           </div>
         </div>
       )}
    </div>
  );
}

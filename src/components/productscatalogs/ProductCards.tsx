import React from "react";
import { Package, CheckCircle, AlertTriangle, XCircle, TrendingUp, TrendingDown, X, Gift } from "lucide-react";
import { Product } from "@/types/product";

interface ProductCardsProps {
  products: Product[];
}

export default function ProductCards({ products = [] }: ProductCardsProps) {
  const [dismissedLowStock, setDismissedLowStock] = React.useState(false);
  const [dismissedOutOfStock, setDismissedOutOfStock] = React.useState(false);

  // Calculate stats from products data
  const totalProducts = products.length;
  const activeProducts = products.filter(product => product.status === 'Published').length;
  const lowStockAlerts = products.filter(product => product.stockQuantity > 0 && (product.lowStockThreshold || 0) > 0 && product.stockQuantity <= (product.lowStockThreshold || 0)).length;
  const outOfStock = products.filter(product => product.stockQuantity === 0).length;
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
      label: 'Total Products',
      value: totalProducts,
      icon: <Package className="w-6 h-6 text-[#0a61d7]" />,
      color: 'bg-[#f7faff]',
      trend: { percent: '+0%', label: 'from last month', up: true }
    },
    {
      label: 'Published Products',
      value: activeProducts,
      icon: <CheckCircle className="w-6 h-6 text-green-500" />,
      color: 'bg-[#e6f7ec]',
      trend: { percent: '+0%', label: 'from last month', up: true }
    },
    {
      label: 'Products with Offers',
      value: productsWithOffers,
      icon: <Gift className="w-6 h-6 text-purple-500" />,
      color: 'bg-[#f3e8ff]',
      trend: { percent: '+0%', label: 'from last month', up: true }
    }
  ];



  return (
    <div className="w-full mx-auto space-y-4">
      {/* Main Stats - Three Column */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"> 
        {stats.map((stat, idx) => (
          <div
            key={stat.label}
            className={`flex flex-col justify-between p-4 rounded-lg shadow bg-white border border-[#e6e6e6] ${stat.color}`}
          >
            <div className="flex items-center gap-4 border-b border-gray-200 pb-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-white shadow-sm">
                {stat.icon}
              </div>
              <div>
                <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{stat.label}</div>
                <div className="text-xl font-bold text-black">{stat.value}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-4 ml-1">
              {stat.trend.up ? (
                <TrendingUp className="w-5 h-5 text-[#3ea73b]" />
              ) : (
                <TrendingDown className="w-5 h-5 text-[#f65911]" />
              )}
              <span className={stat.trend.up ? "text-[#3ea73b] text-xs font-semibold" : "text-[#f65911] text-xs font-semibold"}>
                {stat.trend.percent}
              </span>
              <span className="text-gray-400 text-xs">{stat.trend.label}</span>
            </div>
          </div>
        ))}
      </div>

             {/* Stock Alert Notifications - Full Width */}
       {lowStockAlerts > 0 && !dismissedLowStock && (
         <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
           <div className="flex items-center justify-between">
             <div className="flex items-center gap-3">
               <AlertTriangle className="w-5 h-5 text-orange-600" />
               <span className="text-sm text-orange-700 font-medium">
                 You have {lowStockAlerts} product{lowStockAlerts > 1 ? 's' : ''} on low stock
               </span>
             </div>
             <button
               onClick={() => setDismissedLowStock(true)}
               className="p-1 hover:bg-orange-100 rounded-full transition-colors"
               title="Dismiss notification"
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
                 You have {outOfStock} product{outOfStock > 1 ? 's' : ''} that {outOfStock > 1 ? 'are' : 'is'} out of stock
             </span>
             </div>
             <button
               onClick={() => setDismissedOutOfStock(true)}
               className="p-1 hover:bg-red-100 rounded-full transition-colors"
               title="Dismiss notification"
             >
               <X className="w-4 h-4 text-red-600" />
             </button>
           </div>
         </div>
       )}
    </div>
  );
}

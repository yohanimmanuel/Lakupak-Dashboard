/**
 * Skeleton for the Marketplace page.
 * Matches actual layout:
 *   header (title + time-range + refresh)
 *   → 3-col quick stats (Published / Total / Unpublished)
 *   → DistributorInfo card (customer metrics + company details grid)
 *   → MarketplacePerformance (chart block)
 *   → ProductsList (product cards grid)
 */
import { Skeleton } from '@/components/ui/Skeleton';

function QuickStatCard() {
  return (
    <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
      <Skeleton className="h-3.5 w-28 mb-2" />
      <Skeleton className="h-9 w-16 mb-1" />
      <Skeleton className="h-3 w-40" />
    </div>
  );
}

function ProductCard() {
  return (
    <div className="bg-white rounded-lg border border-[#e6e6e6] overflow-hidden">
      <Skeleton className="w-full h-32" />
      <div className="p-3 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <div className="flex items-center justify-between pt-1">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-7 w-20 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonMarketplacePage() {
  return (
    <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      {/* Page header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-3">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex items-center gap-2">
          {/* Time range dropdown */}
          <Skeleton className="h-9 w-36 rounded-lg" />
          {/* Refresh */}
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>
      </div>

      {/* Quick stats: 3 cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        <QuickStatCard />
        <QuickStatCard />
        <QuickStatCard />
      </div>

      {/* DistributorInfo card */}
      <div className="bg-white rounded-lg border border-[#e6e6e6] mb-3">
        {/* Card header */}
        <div className="p-4 border-b border-[#e6e6e6] flex items-center justify-between">
          <div className="space-y-1">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3.5 w-56" />
          </div>
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
        <div className="p-4 space-y-4">
          {/* Customer metrics row */}
          <div>
            <Skeleton className="h-4 w-24 mb-3" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[0, 1].map((i) => (
                <div key={i} className="rounded-lg bg-blue-50 border border-blue-100 p-4">
                  <Skeleton className="h-3 w-20 mb-2" />
                  <Skeleton className="h-9 w-12 mb-1" />
                  <Skeleton className="h-3 w-28" />
                </div>
              ))}
            </div>
          </div>
          {/* Company details grid */}
          <div>
            <Skeleton className="h-4 w-28 mb-3" />
            <div className="bg-white border border-[#e6e6e6] rounded-lg p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i}>
                    <Skeleton className="h-3 w-28 mb-1.5" />
                    <Skeleton className="h-4 w-40" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MarketplacePerformance */}
      <div className="bg-white rounded-lg border border-[#e6e6e6] p-4 mb-3">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
        {/* Bar chart area */}
        <div className="flex items-end gap-2 h-48">
          {['h-[45%]', 'h-[70%]', 'h-[55%]', 'h-[85%]', 'h-[60%]', 'h-[40%]', 'h-[75%]'].map((h, i) => (
            <div key={i} className="flex-1 flex flex-col justify-end">
              <Skeleton className={`w-full rounded-t-md ${h}`} />
            </div>
          ))}
        </div>
        <div className="flex justify-around mt-3">
          {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-3 w-10" />)}
        </div>
      </div>

      {/* ProductsList */}
      <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
        <Skeleton className="h-5 w-36 mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <ProductCard key={i} />)}
        </div>
      </div>
    </div>
  );
}

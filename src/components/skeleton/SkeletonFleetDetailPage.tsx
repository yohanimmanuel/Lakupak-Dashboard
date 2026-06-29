/**
 * Skeleton for the Logistics fleet details page.
 * Matches OrderfleetDetails layout: white card → breadcrumb(back + code + status + edit + route) →
 * 3-column grid: left (trip summary / driver / vehicle cards),
 * right (logistics details + route map + customer).
 */
import { Skeleton } from '@/components/ui/Skeleton';

function DetailRow() {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <Skeleton className="h-3.5 w-28" />
      <Skeleton className="h-3.5 w-24" />
    </div>
  );
}

function CardHeader() {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Skeleton className="h-4 w-4 rounded" />
      <Skeleton className="h-4 w-32" />
    </div>
  );
}

export function SkeletonFleetDetailPage() {
  return (
    <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      <div className="w-full mx-auto">
        <div className="bg-white p-4 rounded-lg border border-[#e6e6e6]">
          {/* Breadcrumb */}
          <div className="mb-4">
            <Skeleton className="h-6 w-40 mb-2" />
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-7 w-36" />
                <Skeleton className="h-6 w-24 rounded-full" />
              </div>
              <Skeleton className="h-9 w-28 rounded-lg" />
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-3.5 w-52" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left column */}
            <div className="lg:col-span-1 flex flex-col gap-4">
              {/* Trip summary */}
              <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
                <CardHeader />
                <div className="space-y-1">
                  {Array.from({ length: 6 }).map((_, i) => <DetailRow key={i} />)}
                </div>
              </div>

              {/* Driver */}
              <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
                <CardHeader />
                <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
                  <Skeleton className="h-12 w-12 rounded-full shrink-0" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
                <div className="space-y-1 pt-2">
                  {Array.from({ length: 3 }).map((_, i) => <DetailRow key={i} />)}
                </div>
              </div>

              {/* Vehicle */}
              <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
                <CardHeader />
                <div className="flex justify-center mb-4">
                  <Skeleton className="h-24 w-40 rounded-lg" />
                </div>
                <div className="space-y-1">
                  {Array.from({ length: 6 }).map((_, i) => <DetailRow key={i} />)}
                </div>
              </div>
            </div>

            {/* Right column */}
            <div className="lg:col-span-2 flex flex-col gap-4">
              {/* Logistics details */}
              <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
                <Skeleton className="h-5 w-40 mb-4" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                  {Array.from({ length: 4 }).map((_, i) => <DetailRow key={i} />)}
                </div>
              </div>

              {/* Route map */}
              <div className="bg-white rounded-lg border border-[#e6e6e6] overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#e6e6e6]">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-4 rounded" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <Skeleton className="h-7 w-24 rounded-lg" />
                </div>
                <Skeleton className="w-full h-72" />
              </div>

              {/* Customer */}
              <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
                <Skeleton className="h-5 w-36 mb-4" />
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 py-2 border-b border-[#f0f0f0] last:border-0">
                      <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-3.5 w-40" />
                        <Skeleton className="h-3 w-28" />
                      </div>
                      <Skeleton className="h-3.5 w-16" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

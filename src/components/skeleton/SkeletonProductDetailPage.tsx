/**
 * Skeleton for the Product catalog view/edit page.
 * Matches ProductCatalog layout: single white card →
 * header(back + title + status + actions) → mode description bar →
 * completion progress bar → general info section (grid fields) →
 * images section (gallery + details split) → variants/pricing table.
 */
import { Skeleton } from '@/components/ui/Skeleton';

export function SkeletonProductDetailPage() {
  return (
    <div className="flex min-h-full w-full min-w-0 flex-col bg-gradient-to-b from-gray-50 to-white p-4">
      <div className="w-full mx-auto bg-white rounded-lg border border-[#e6e6e6]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#e6e6e6]">
          <div className="flex items-center gap-4">
            <Skeleton className="h-9 w-20 rounded-lg" />
            <div className="flex items-center gap-3">
              <Skeleton className="h-7 w-44" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-24 rounded-lg" />
            <Skeleton className="h-9 w-32 rounded-lg" />
          </div>
        </div>

        {/* Completion progress bar */}
        <div className="mx-4 mt-4 mb-4 p-4 rounded-lg border border-[#e6e6e6] bg-gray-50">
          <div className="flex items-center justify-between mb-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-10" />
          </div>
          <Skeleton className="h-2 w-full rounded-full mb-2" />
          <Skeleton className="h-3 w-72 max-w-full" />
        </div>

        {/* Form body */}
        <div className="p-4 space-y-4">
          {/* General information */}
          <div className="rounded-lg border border-[#e6e6e6] p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-5 w-40" />
            </div>
            <div className="grid grid-cols-1 @3xl/main:grid-cols-2 @5xl/main:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-9 w-full rounded-lg" />
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-24 w-full rounded-lg" />
            </div>
          </div>

          {/* Images + details split */}
          <div className="rounded-lg border border-[#e6e6e6] p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-5 w-36" />
            </div>
            <div className="grid grid-cols-1 @5xl/main:grid-cols-5 gap-4">
              {/* Gallery */}
              <div className="@5xl/main:col-span-3 space-y-3">
                <Skeleton className="w-full h-64 rounded-lg" />
                <div className="flex gap-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="w-20 h-16 rounded-lg" />
                  ))}
                </div>
              </div>
              {/* Details */}
              <div className="@5xl/main:col-span-2 space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex flex-col gap-1.5">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-9 w-full rounded-lg" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Variants / pricing */}
          <div className="rounded-lg border border-[#e6e6e6] p-4">
            <div className="flex items-center gap-2 mb-4">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-5 w-44" />
            </div>
            {/* Column headers */}
            <div className="flex items-center gap-4 pb-3 border-b border-[#e6e6e6]">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-3 w-20 flex-1" />
              ))}
            </div>
            {/* Rows */}
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 py-3 border-b border-[#f0f0f0] last:border-0">
                {Array.from({ length: 5 }).map((_, j) => (
                  <Skeleton key={j} className="h-4 w-20 flex-1" />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

import { Skeleton } from '@/components/ui/Skeleton';

function InfoRow() {
  return (
    <div className="flex items-center justify-between gap-2">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

export function SkeletonOrderDetailPage() {
  return (
    <div className="flex min-h-full w-full min-w-0 flex-col bg-gradient-to-b from-gray-50 to-white p-4">
      <div className="w-full mx-auto">
        <div className="bg-white p-4 rounded-lg border border-[#e6e6e6]">
          {/* Completion progress bar */}
          <div className="mb-4 p-4 rounded-lg border border-[#e6e6e6] bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-10" />
            </div>
            <Skeleton className="h-2 w-full rounded-full mb-2" />
            <Skeleton className="h-3 w-72 max-w-full" />
          </div>

          {/* Header: back + status buttons */}
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-6 w-28" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-9 w-28 rounded-lg" />
              <Skeleton className="h-9 w-28 rounded-lg" />
              <Skeleton className="h-9 w-20 rounded-lg" />
            </div>
          </div>

          {/* Row 1: Full-width customer information */}
          <div className="w-full mb-4">
            <div className="rounded-lg border border-[#e6e6e6] p-4">
              <Skeleton className="h-5 w-40 mb-4" />
              <div className="flex items-start gap-4">
                <Skeleton className="h-16 w-16 rounded-full shrink-0" />
                <div className="flex-1 space-y-3">
                  <Skeleton className="h-5 w-48" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <InfoRow />
                      <InfoRow />
                    </div>
                    <div className="space-y-2">
                      <InfoRow />
                      <InfoRow />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Row 2: Total order + updates/status side by side */}
          <div className="grid grid-cols-1 @4xl/main:grid-cols-2 gap-4 mb-4">
            {/* Total order */}
            <div className="rounded-lg border border-[#e6e6e6] p-4">
              <Skeleton className="h-5 w-28 mb-2" />
              <Skeleton className="h-8 w-36 mb-3" />
              <div className="rounded-lg border border-[#e6e6e6] bg-gray-50 p-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-6 w-16 rounded" />
                </div>
                <Skeleton className="h-3 w-full max-w-xs" />
              </div>
              <Skeleton className="h-4 w-36 mb-3" />
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <InfoRow key={i} />
                ))}
              </div>
              <div className="rounded-lg border border-[#e6e6e6] bg-gray-50 p-4 mt-4 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            </div>

            {/* Updates & status (map + address) */}
            <div className="rounded-lg border border-[#e6e6e6] p-4">
              <Skeleton className="h-5 w-36 mb-4" />
              <div className="mb-4">
                <Skeleton className="h-4 w-32 mb-2" />
                <Skeleton className="w-full h-80 rounded-lg" />
              </div>
              <div className="border-b border-[#e6e6e6] pb-4 mb-4 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
              <div className="rounded-lg border border-[#e6e6e6] bg-gray-50 p-4 space-y-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          </div>

          {/* Row 3: Order items (3) + order summary (4) */}
          <div className="grid grid-cols-1 @5xl/main:grid-cols-7 gap-4">
            {/* Order items */}
            <div className="@5xl/main:col-span-3 rounded-lg border border-[#e6e6e6] p-4">
              <Skeleton className="h-5 w-32 mb-4" />
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-3">
                    <Skeleton className="h-14 w-14 rounded-lg shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-36" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <div className="text-right space-y-1">
                      <Skeleton className="h-3 w-16 ml-auto" />
                      <Skeleton className="h-4 w-20 ml-auto" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Order summary */}
            <div className="@5xl/main:col-span-4 rounded-lg border border-[#e6e6e6] p-4">
              <Skeleton className="h-5 w-36 mb-4" />
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="rounded-lg border border-[#e6e6e6] bg-gray-50 p-3">
                  <Skeleton className="h-3 w-24 mb-2" />
                  <Skeleton className="h-6 w-12" />
                </div>
                <div className="rounded-lg border border-[#e6e6e6] bg-gray-50 p-3">
                  <Skeleton className="h-3 w-28 mb-2" />
                  <Skeleton className="h-6 w-12" />
                </div>
              </div>
              <div className="overflow-x-auto">
                <div className="flex items-center gap-3 pb-2 border-b border-[#e6e6e6]">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-3 flex-1 min-w-[3rem]" />
                  ))}
                </div>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 py-3 border-b border-[#f0f0f0] last:border-0">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <Skeleton key={j} className="h-4 flex-1 min-w-[3rem]" />
                    ))}
                  </div>
                ))}
                <div className="flex items-center justify-between pt-3 border-t-2 border-[#e6e6e6] mt-1">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-28" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

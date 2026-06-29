/**
 * Skeleton for the Marketing team agent details page.
 * Matches SalesDetails layout: white card → breadcrumb(back + name + edit) →
 * 3-column grid: left profile column (avatar/target/info/status + favourite products),
 * right column (about + daily field report list).
 */
import { Skeleton } from '@/components/ui/Skeleton';

function LabelValueRow() {
  return (
    <div className="flex items-center justify-between gap-2">
      <Skeleton className="h-3.5 w-16" />
      <Skeleton className="h-3.5 w-24" />
    </div>
  );
}

export function SkeletonAgentDetailPage() {
  return (
    <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      <div className="bg-white p-4 rounded-lg border border-[#e6e6e6]">
        <div className="w-full mx-auto">
          {/* Breadcrumb */}
          <div className="mb-4">
            <Skeleton className="h-6 w-40 mb-2" />
            <div className="flex items-center justify-between">
              <Skeleton className="h-7 w-44" />
              <Skeleton className="h-9 w-28 rounded-lg" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left column */}
            <div className="lg:col-span-1 flex flex-col gap-4">
              {/* Profile card */}
              <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
                {/* Profile header */}
                <div className="flex flex-col items-center pb-4 border-b border-gray-200 gap-2">
                  <Skeleton className="h-24 w-24 rounded-full mb-2" />
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-3.5 w-24" />
                </div>
                {/* Sales target */}
                <div className="py-4 border-b border-[#e6e6e6] space-y-3">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-3.5 w-16" />
                  </div>
                  <Skeleton className="h-2.5 w-full rounded-full" />
                  <LabelValueRow />
                  <LabelValueRow />
                </div>
                {/* Other info */}
                <div className="py-4 border-b border-[#e6e6e6] space-y-2.5">
                  <Skeleton className="h-4 w-24 mb-1" />
                  <LabelValueRow />
                  <LabelValueRow />
                  <LabelValueRow />
                </div>
                {/* Employee status */}
                <div className="py-4">
                  <Skeleton className="h-4 w-40 mb-3" />
                  <div className="flex items-center justify-between gap-3">
                    <Skeleton className="h-3.5 w-16" />
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </div>
                </div>
              </div>

              {/* Favourite products card */}
              <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-4 w-40" />
                </div>
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-3.5 w-32" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right column */}
            <div className="lg:col-span-2 flex flex-col gap-4">
              {/* About */}
              <div className="bg-white rounded-lg border border-[#e6e6e6] p-4 space-y-3">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-2/3" />
              </div>

              {/* Daily field report */}
              <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
                <Skeleton className="h-5 w-44 mb-4" />
                <div className="flex items-center gap-2 mb-4">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-3.5 w-32" />
                </div>
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between p-3 border border-[#e6e6e6] rounded-lg">
                      <Skeleton className="h-3.5 w-28" />
                      <Skeleton className="h-3.5 w-20" />
                    </div>
                  ))}
                </div>
                {/* Pagination */}
                <div className="flex items-center justify-between mt-6">
                  <Skeleton className="h-3.5 w-40" />
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-8 w-8 rounded-md" />
                    <Skeleton className="h-8 w-8 rounded-md" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

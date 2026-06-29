/**
 * Skeleton for buyer/supplier profile detail pages.
 * Matches BuyerProfile / SupplierProfile layout:
 * white card → header(back + title + copy/edit) → completion bar →
 * info sections grid → order history table.
 */
import { Skeleton } from '@/components/ui/Skeleton';

function InfoRow() {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-[#f0f0f0] last:border-0">
      <Skeleton className="h-4 w-4 rounded mt-0.5 shrink-0" />
      <div className="flex flex-col gap-1.5 flex-1">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-4 w-40" />
      </div>
    </div>
  );
}

function InfoCard({ rows = 4 }: { rows?: number }) {
  return (
    <div className="rounded-lg border border-[#e6e6e6] p-4">
      <Skeleton className="h-5 w-36 mb-3" />
      <div className="space-y-0">
        {Array.from({ length: rows }).map((_, i) => <InfoRow key={i} />)}
      </div>
    </div>
  );
}

export function SkeletonClientProfilePage() {
  return (
    <div className="p-4 w-full min-h-screen flex items-start justify-center bg-gradient-to-b from-gray-50 to-white">
      <div className="w-full mx-auto bg-white rounded-lg border border-[#e6e6e6] p-4 flex flex-col gap-4">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
          <div className="flex items-center gap-4">
            <Skeleton className="h-5 w-5 rounded" />
            <div className="space-y-1.5">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-3.5 w-64" />
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <Skeleton className="h-9 w-28 rounded-lg" />
            <Skeleton className="h-9 w-32 rounded-lg" />
          </div>
        </div>

        {/* Completion progress bar */}
        <div className="p-4 rounded-lg border border-[#e6e6e6] bg-gray-50">
          <div className="flex items-center justify-between mb-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-10" />
          </div>
          <Skeleton className="h-2 w-full rounded-full mb-2" />
          <Skeleton className="h-3 w-72" />
        </div>

        {/* Info sections */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <InfoCard rows={5} />
          <InfoCard rows={4} />
        </div>

        {/* Order history table */}
        <div className="rounded-lg border border-[#e6e6e6] p-4">
          <Skeleton className="h-5 w-44 mb-4" />
          {/* Column headers */}
          <div className="flex items-center gap-4 pb-3 border-b border-[#e6e6e6]">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-3 w-24 flex-1" />
            ))}
          </div>
          {/* Rows */}
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-3 border-b border-[#f0f0f0] last:border-0">
              {Array.from({ length: 5 }).map((_, j) => (
                <Skeleton key={j} className="h-4 w-24 flex-1" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

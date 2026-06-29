/**
 * Skeleton for profile/detail view pages:
 * Buyer profile, Supplier profile, Order details, Product catalog view
 *
 * Layout: back button + actions → profile card (avatar + info) → detail sections
 */
import { Skeleton } from '@/components/ui/Skeleton';

function InfoRow() {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-[#f0f0f0] last:border-0">
      <Skeleton className="h-4 w-4 rounded mt-0.5 shrink-0" />
      <div className="flex flex-col gap-1">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-4 w-40" />
      </div>
    </div>
  );
}

function Section({ label = true, rows = 3 }: { label?: boolean; rows?: number }) {
  return (
    <div className="rounded-lg border border-[#e6e6e6] bg-white p-5">
      {label && <Skeleton className="h-5 w-40 mb-4" />}
      <div className="space-y-0">
        {Array.from({ length: rows }).map((_, i) => <InfoRow key={i} />)}
      </div>
    </div>
  );
}

export function SkeletonDetailPage() {
  return (
    <div className="w-full p-4 space-y-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-3.5 w-64" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>
      </div>

      {/* Profile card */}
      <div className="rounded-lg border border-[#e6e6e6] bg-white p-5 flex flex-col sm:flex-row gap-5">
        <Skeleton className="h-24 w-24 rounded-full shrink-0 mx-auto sm:mx-0" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-64" />
          <div className="flex flex-wrap gap-2 mt-2">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-28 rounded-full" />
          </div>
        </div>
        <div className="flex flex-col gap-2 items-end shrink-0">
          <Skeleton className="h-9 w-28 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
      </div>

      {/* Detail sections in 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section rows={4} />
        <Section rows={4} />
      </div>

      {/* Full-width section */}
      <Section rows={3} />
    </div>
  );
}

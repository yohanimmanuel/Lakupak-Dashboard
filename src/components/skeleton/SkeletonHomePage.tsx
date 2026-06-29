/**
 * Skeleton for the Home dashboard page.
 * Layout: header → 4 metric cards → 2-column widget grid
 */
import { Skeleton } from '@/components/ui/Skeleton';

function WidgetCard({ rows = 4, tall = false }: { rows?: number; tall?: boolean }) {
  return (
    <div className={`rounded-lg border border-[#e6e6e6] bg-white p-4 ${tall ? 'row-span-2' : ''}`}>
      {/* Widget header */}
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-7 w-20 rounded-md" />
      </div>
      <Skeleton className="h-3 w-52 mb-4" />
      {/* Widget rows */}
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg border border-[#f0f0f0]">
            <Skeleton className="h-9 w-9 rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricCard() {
  return (
    <div className="rounded-lg border border-[#e6e6e6] bg-white p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3 pb-3 border-b border-[#e6e6e6]">
        <Skeleton className="h-12 w-12 rounded-lg shrink-0" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-6 w-28" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-4 rounded-full" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}

export function SkeletonHomePage() {
  return (
    <div className="w-full p-4 space-y-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-9 w-36 rounded-lg" />
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <MetricCard key={i} />)}
      </div>

      {/* Widget grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <WidgetCard rows={4} />
        <WidgetCard rows={4} />
        <WidgetCard rows={3} />
        <WidgetCard rows={3} />
      </div>
    </div>
  );
}

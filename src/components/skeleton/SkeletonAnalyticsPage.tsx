/**
 * Skeleton for analytics pages:
 * Analytics overview, Sales, Financial, Operational Performance
 *
 * Layout: header + time-range → metric cards → charts (side-by-side + full-width)
 */
import { Skeleton } from '@/components/ui/Skeleton';

function MetricCard() {
  return (
    <div className="rounded-lg border border-[#e6e6e6] bg-white p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3 pb-3 border-b border-[#e6e6e6]">
        <Skeleton className="h-12 w-12 rounded-lg shrink-0" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-28" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-4 rounded-full" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}

const BAR_HEIGHTS = ['h-[40%]', 'h-[70%]', 'h-[55%]', 'h-[90%]', 'h-[65%]', 'h-[48%]'];

function ChartBlock({ tall = false }: { tall?: boolean }) {
  return (
    <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
      <div className="flex items-center justify-between mb-6">
        <Skeleton className="h-5 w-40" />
        <div className="flex gap-3">
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-3.5 w-20" />
        </div>
      </div>
      {/* Y-axis labels */}
      <div className="flex gap-4">
        <div className="flex flex-col justify-between pb-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-3 w-14 mb-6" />
          ))}
        </div>
        {/* Chart area */}
        <div className={`flex-1 flex items-end gap-2 ${tall ? 'h-80' : 'h-64'}`}>
          {BAR_HEIGHTS.map((h, i) => (
            <div key={i} className="flex-1 flex flex-col justify-end gap-1">
              <Skeleton className={`w-full rounded-t-md ${h}`} />
            </div>
          ))}
        </div>
      </div>
      {/* X-axis */}
      <div className="flex justify-around mt-3 pl-16">
        {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-3 w-10" />)}
      </div>
    </div>
  );
}

function PieChartBlock() {
  return (
    <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
      <div className="flex items-center justify-between mb-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-8 w-32 rounded-lg" />
      </div>
      <div className="flex items-center justify-center py-6">
        <Skeleton className="h-44 w-44 rounded-full" />
      </div>
      <div className="flex flex-wrap justify-center gap-4 mt-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="h-3 w-3 rounded-full" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonAnalyticsPage() {
  return (
    <div className="w-full p-4 space-y-3 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      {/* Page header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-2">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32 rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <MetricCard key={i} />)}
      </div>

      {/* Two side-by-side charts */}
      <div className="grid grid-cols-1 lg:grid-cols-11 gap-3">
        <div className="lg:col-span-7">
          <ChartBlock tall />
        </div>
        <div className="lg:col-span-4">
          <PieChartBlock />
        </div>
      </div>

      {/* Full-width chart */}
      <ChartBlock />

      {/* Table (top products) */}
      <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
        <Skeleton className="h-5 w-48 mb-6" />
        <div className="space-y-3">
          <div className="flex gap-4 pb-2 border-b border-[#e6e6e6]">
            {['w-14', 'w-44', 'w-24', 'w-20', 'w-24', 'w-16'].map((w, i) => (
              <Skeleton key={i} className={`h-3 ${w}`} />
            ))}
          </div>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-1">
              <Skeleton className="h-3 w-6" />
              <div className="flex items-center gap-2 w-44">
                <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
                <Skeleton className="h-3 flex-1" />
              </div>
              <Skeleton className="h-3 w-24 hidden md:block" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-14" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

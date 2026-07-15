/**
 * Skeleton for the Orders page.
 * Matches layout: header → stat cards → GPS map → orders table
 */
import { Skeleton } from '@/components/ui/Skeleton';

function StatCard() {
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

function TableRow() {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-[#f0f0f0] last:border-0">
      <Skeleton className="h-4 w-4 rounded" />
      <Skeleton className="h-9 w-9 rounded-full shrink-0" />
      <div className="flex-1 flex flex-col gap-1.5">
        <Skeleton className="h-3.5 w-36" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="h-3.5 w-24 hidden md:block" />
      <Skeleton className="h-3.5 w-20 hidden lg:block" />
      <Skeleton className="h-6 w-20 rounded-full" />
      <Skeleton className="h-7 w-16 rounded-md" />
    </div>
  );
}

export function SkeletonOrdersPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-4">
      <div className="w-full mx-auto">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div>
            <Skeleton className="h-7 w-36" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-24 rounded-lg" />
            <Skeleton className="h-9 w-28 rounded-lg" />
            <Skeleton className="h-9 w-28 rounded-lg" />
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          {[...Array(4)].map((_, i) => <StatCard key={i} />)}
        </div>

        {/* GPS Map placeholder */}
        <div className="rounded-lg border border-[#e6e6e6] bg-white overflow-hidden mb-3">
          {/* Map header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#e6e6e6]">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-4 w-36" />
            </div>
            <Skeleton className="h-7 w-24 rounded-lg" />
          </div>
          {/* Map canvas area */}
          <Skeleton className="w-full h-64" />
        </div>

        {/* Orders table */}
        <div className="rounded-lg border border-[#e6e6e6] bg-white overflow-hidden">
          {/* Table search/filter bar */}
          <div className="flex items-center gap-3 p-4 border-b border-[#e6e6e6]">
            <Skeleton className="h-9 flex-1 max-w-xs rounded-lg" />
            <Skeleton className="h-9 w-28 rounded-lg" />
            <Skeleton className="h-9 w-24 rounded-lg hidden sm:block" />
          </div>
          {/* Column headers */}
          <div className="flex items-center gap-4 px-4 py-3 bg-gray-50 border-b border-[#e6e6e6]">
            <Skeleton className="h-3.5 w-3.5 rounded" />
            <Skeleton className="h-3.5 w-3.5 rounded" />
            <Skeleton className="h-3 w-24 flex-1" />
            <Skeleton className="h-3 w-20 hidden md:block" />
            <Skeleton className="h-3 w-16 hidden lg:block" />
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-3 w-14" />
          </div>
          {/* Rows */}
          {[...Array(8)].map((_, i) => <TableRow key={i} />)}
          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#e6e6e6]">
            <Skeleton className="h-3.5 w-32" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-8 rounded-md" />
              <Skeleton className="h-8 w-8 rounded-md" />
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

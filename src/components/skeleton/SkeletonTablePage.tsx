/**
 * Skeleton for list/table pages:
 * Orders, Products, Buyers, Suppliers, Team, Offers, Logistics
 *
 * Layout: header → stat cards → search bar → table rows
 */
import { Skeleton } from '@/components/ui/Skeleton';

function StatCard() {
  return (
    <div className="rounded-lg border border-[#e6e6e6] bg-white p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

function TableRow() {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-[#f0f0f0] last:border-0">
      <Skeleton className="h-4 w-4 rounded" />
      <Skeleton className="h-9 w-9 rounded-full shrink-0" />
      <div className="flex-1 flex flex-col gap-2">
        <Skeleton className="h-3.5 w-40" />
        <Skeleton className="h-3 w-28" />
      </div>
      <Skeleton className="h-3.5 w-24 hidden md:block" />
      <Skeleton className="h-3.5 w-20 hidden lg:block" />
      <Skeleton className="h-6 w-20 rounded-full" />
      <Skeleton className="h-7 w-16 rounded-md" />
    </div>
  );
}

export function SkeletonTablePage({ rows = 8, statCards = 4 }: { rows?: number; statCards?: number }) {
  return (
    <div
      className="flex min-h-full w-full min-w-0 flex-col space-y-5 bg-gradient-to-b from-gray-50 to-white p-4"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading page content…</span>
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <Skeleton className="h-7 w-48" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
      </div>

      {/* Stat cards */}
      {statCards > 0 && (
        <div className={`grid gap-3 ${statCards === 4 ? 'grid-cols-1 @3xl/main:grid-cols-2 @5xl/main:grid-cols-4' : statCards === 3 ? 'grid-cols-1 @3xl/main:grid-cols-3' : 'grid-cols-1 @3xl/main:grid-cols-2'}`}>
          {Array.from({ length: statCards }).map((_, i) => <StatCard key={i} />)}
        </div>
      )}

      {/* Table container */}
      <div className="rounded-lg border border-[#e6e6e6] bg-white overflow-hidden">
        {/* Search / filter bar */}
        <div className="flex items-center gap-3 p-4 border-b border-[#e6e6e6]">
          <Skeleton className="h-9 flex-1 max-w-xs rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg hidden sm:block" />
        </div>

        {/* Table header */}
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
        {Array.from({ length: rows }).map((_, i) => <TableRow key={i} />)}

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
  );
}

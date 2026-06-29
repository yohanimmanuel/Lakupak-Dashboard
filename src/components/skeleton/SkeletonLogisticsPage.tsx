/**
 * Skeleton for the Logistics page.
 * Matches actual layout:
 *   header (title + refresh / export / add-fleet buttons)
 *   → 2-column grid:
 *     Left  — OrderfleetList: search + Fleets/Drivers tabs + fleet cards (selectable)
 *     Right — FleetDetails: fleet info header + map placeholder + details sections
 */
import { Skeleton } from '@/components/ui/Skeleton';

function FleetCard({ active = false }: { active?: boolean }) {
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${active ? 'border-[#0a61d7] bg-blue-50' : 'border-[#e6e6e6] bg-white'} mb-2`}>
      {/* Checkbox */}
      <Skeleton className="h-4 w-4 rounded mt-1 shrink-0" />
      {/* Fleet icon */}
      <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
      {/* Info */}
      <div className="flex-1 space-y-1.5 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-5 w-20 rounded-full shrink-0" />
        </div>
        <Skeleton className="h-3 w-40" />
        <div className="flex items-center gap-2 pt-0.5">
          <Skeleton className="h-3 w-3 rounded-full" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
    </div>
  );
}

function DetailSection({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-0">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between py-2.5 border-b border-[#f0f0f0] last:border-0">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4 rounded shrink-0" />
            <Skeleton className="h-3.5 w-28" />
          </div>
          <Skeleton className="h-3.5 w-32" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonLogisticsPage() {
  return (
    <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      {/* Page header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
          <Skeleton className="h-9 w-36 rounded-lg bg-[#0a61d7]/20" />
        </div>
      </div>

      {/* 2-column grid */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* LEFT — OrderfleetList */}
        <div className="bg-white rounded-lg border border-[#e6e6e6] flex flex-col overflow-hidden">
          {/* Search bar */}
          <div className="p-4 border-b border-[#e6e6e6]">
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
          {/* Fleets / Drivers tabs */}
          <div className="flex border-b border-[#e6e6e6]">
            <div className="flex-1 px-4 py-3 border-b-2 border-[#0a61d7]">
              <Skeleton className="h-4 w-16 mx-auto" />
            </div>
            <div className="flex-1 px-4 py-3">
              <Skeleton className="h-4 w-14 mx-auto" />
            </div>
          </div>
          {/* Fleet cards */}
          <div className="p-3 flex-1">
            <FleetCard active />
            <FleetCard />
            <FleetCard />
            <FleetCard />
            <FleetCard />
          </div>
        </div>

        {/* RIGHT — FleetDetails */}
        <div className="bg-white rounded-lg border border-[#e6e6e6] overflow-hidden">
          {/* Detail header */}
          <div className="p-4 border-b border-[#e6e6e6] flex items-start justify-between gap-3">
            <div className="space-y-1.5">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-3.5 w-52" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full shrink-0" />
          </div>

          {/* Map placeholder */}
          <div className="relative">
            <Skeleton className="w-full h-44" />
            {/* Tracking button overlay */}
            <div className="absolute bottom-3 right-3">
              <Skeleton className="h-8 w-32 rounded-lg" />
            </div>
          </div>

          {/* Fleet info sections */}
          <div className="p-4 space-y-4">
            <div>
              <Skeleton className="h-4 w-32 mb-3" />
              <DetailSection rows={3} />
            </div>
            <div>
              <Skeleton className="h-4 w-28 mb-3" />
              <DetailSection rows={3} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton for marketing/team page.
 * Matches: page header → TeamList (white card → pill tabs → search → agent rows)
 */
import { Skeleton } from '@/components/ui/Skeleton';

function AgentRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-[#f0f0f0] last:border-0">
      {/* Checkbox */}
      <Skeleton className="h-4 w-4 rounded shrink-0" />
      {/* Avatar */}
      <Skeleton className="h-10 w-10 rounded-full shrink-0" />
      {/* Name + role */}
      <div className="flex-1 space-y-1.5 min-w-0">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-3 w-24" />
      </div>
      {/* Territory */}
      <div className="hidden md:flex items-center gap-1.5 w-32 shrink-0">
        <Skeleton className="h-3.5 w-3.5 rounded-full" />
        <Skeleton className="h-3.5 w-20" />
      </div>
      {/* Status badge */}
      <Skeleton className="h-6 w-16 rounded-full shrink-0" />
      {/* Action buttons */}
      <div className="flex items-center gap-1.5 shrink-0">
        <Skeleton className="h-8 w-8 rounded-lg" />
        <Skeleton className="h-8 w-8 rounded-lg" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
    </div>
  );
}

export function SkeletonTeamPage() {
  return (
    <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      {/* Page header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-48" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
      </div>

      {/* TeamList white card */}
      <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
        {/* Card header: title + count */}
        <div className="flex items-center gap-2 mb-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-8 rounded-full" />
        </div>

        {/* Pill tab switcher (Individuals / Teams) */}
        <div className="mb-4">
          <div className="inline-flex bg-gray-100 rounded-xl p-0.5 gap-0">
            <Skeleton className="h-9 w-28 rounded-xl" />
            <Skeleton className="h-9 w-24 rounded-xl bg-transparent" />
          </div>
        </div>

        {/* Search + filters */}
        <div className="flex flex-col md:flex-row gap-2 mb-4">
          <Skeleton className="h-9 w-64 rounded-lg" />
          <Skeleton className="h-9 w-36 rounded-lg" />
          <Skeleton className="h-9 w-36 rounded-lg" />
        </div>

        {/* Column headers */}
        <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 rounded-t-lg border border-[#e6e6e6] border-b-0">
          <Skeleton className="h-3.5 w-3.5 rounded" />
          <Skeleton className="h-3.5 w-3.5 rounded" />
          <div className="flex-1"><Skeleton className="h-3 w-24" /></div>
          <div className="hidden md:block w-32 shrink-0"><Skeleton className="h-3 w-20" /></div>
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-3 w-16" />
        </div>

        {/* Agent rows */}
        <div className="border border-[#e6e6e6] rounded-b-lg overflow-hidden">
          {Array.from({ length: 7 }).map((_, i) => <AgentRow key={i} />)}
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-4">
          <Skeleton className="h-3.5 w-36" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
        </div>
      </div>
    </div>
  );
}

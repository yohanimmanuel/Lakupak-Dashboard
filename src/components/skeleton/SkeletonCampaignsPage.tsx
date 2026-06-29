/**
 * Skeleton for marketing/campaigns page.
 * Matches: header → tip banner → CampaignTable
 *   (status tabs w/ indicator → search+recipient filter → campaign rows → pagination)
 */
import { Skeleton } from '@/components/ui/Skeleton';

function CampaignRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#f0f0f0] last:border-0">
      {/* Checkbox */}
      <Skeleton className="h-4 w-4 rounded shrink-0" />
      {/* Campaign name + recipient type */}
      <div className="flex-1 space-y-1.5 min-w-0">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-3 w-28" />
      </div>
      {/* Status pill */}
      <Skeleton className="h-6 w-20 rounded-full shrink-0" />
      {/* Recipients */}
      <Skeleton className="h-3.5 w-14 hidden sm:block shrink-0" />
      {/* Opens */}
      <Skeleton className="h-3.5 w-12 hidden md:block shrink-0" />
      {/* Clicks */}
      <Skeleton className="h-3.5 w-12 hidden md:block shrink-0" />
      {/* Revenue */}
      <Skeleton className="h-3.5 w-20 hidden lg:block shrink-0" />
      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <Skeleton className="h-8 w-8 rounded-lg" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
    </div>
  );
}

export function SkeletonCampaignsPage() {
  return (
    <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-4 w-72" />
        </div>
        {/* Create Campaign button */}
        <Skeleton className="h-9 w-40 rounded-lg" />
      </div>

      {/* Tip banner */}
      <div className="rounded-lg border border-[#e6e6e6] bg-white p-4 mb-3 flex items-start gap-3">
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-full max-w-md" />
          <Skeleton className="h-3.5 w-40" />
        </div>
        <Skeleton className="h-6 w-6 rounded-full shrink-0" />
      </div>

      {/* CampaignTable */}
      <div className="bg-white rounded-lg border border-[#e6e6e6] overflow-hidden">
        {/* Status tabs with indicator */}
        <div className="flex border-b border-[#e6e6e6] relative px-2 pt-1">
          {['w-12', 'w-14', 'w-20', 'w-20'].map((w, i) => (
            <div
              key={i}
              className="px-4 py-2.5 border-b-2 border-transparent"
            >
              <Skeleton className={`h-4 ${w}`} />
            </div>
          ))}
        </div>

        {/* Search + filter bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 p-4 border-b border-[#e6e6e6]">
          <Skeleton className="h-9 flex-1 max-w-xs rounded-lg" />
          <Skeleton className="h-9 w-36 rounded-lg" />
        </div>

        {/* Column headers */}
        <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 border-b border-[#e6e6e6]">
          <Skeleton className="h-3.5 w-3.5 rounded" />
          <div className="flex-1"><Skeleton className="h-3 w-28" /></div>
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-14 hidden sm:block" />
          <Skeleton className="h-3 w-12 hidden md:block" />
          <Skeleton className="h-3 w-12 hidden md:block" />
          <Skeleton className="h-3 w-16 hidden lg:block" />
          <Skeleton className="h-3 w-10" />
        </div>

        {/* Campaign rows */}
        {Array.from({ length: 8 }).map((_, i) => <CampaignRow key={i} />)}

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

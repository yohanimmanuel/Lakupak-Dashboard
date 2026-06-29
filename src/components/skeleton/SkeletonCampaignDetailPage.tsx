/**
 * Skeleton for the Campaign details page.
 * Matches CampaignDetails layout: white card with bordered header(back + title + status + actions) →
 * campaign information form section → WhatsApp design block → campaign metrics grid.
 */
import { Skeleton } from '@/components/ui/Skeleton';

export function SkeletonCampaignDetailPage() {
  return (
    <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      <div className="w-full mx-auto bg-white rounded-lg border border-[#e6e6e6]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#e6e6e6]">
          <div className="flex items-center gap-4">
            <Skeleton className="h-9 w-20 rounded-lg" />
            <div className="flex items-center gap-3">
              <Skeleton className="h-7 w-44" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          </div>
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Campaign information */}
          <div className="rounded-lg border border-[#e6e6e6] p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-5 w-44" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-9 w-full rounded-lg" />
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-9 w-full rounded-lg" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-24 w-full rounded-lg" />
            </div>
          </div>

          {/* WhatsApp design block */}
          <div className="rounded-lg border border-[#e6e6e6] p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-5 w-48" />
            </div>
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>

          {/* Campaign metrics */}
          <div className="rounded-lg border border-[#e6e6e6] p-4">
            <Skeleton className="h-5 w-44 mb-4" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-6 w-12" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

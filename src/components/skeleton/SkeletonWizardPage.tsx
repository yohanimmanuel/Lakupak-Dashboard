/**
 * Skeleton for tab-wizard pages (Offer details, Fleet edit).
 * Matches layout: header(back + title + actions) →
 * horizontal tab bar card (pill buttons with icon + 2 text lines) → content card.
 */
import { Skeleton } from '@/components/ui/Skeleton';

export function SkeletonWizardPage({ tabs = 4, actions = 3 }: { tabs?: number; actions?: number }) {
  return (
    <div className="p-4 space-y-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-20 rounded-lg" />
          <div>
            <Skeleton className="h-7 w-56" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {Array.from({ length: actions }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-24 rounded-lg" />
          ))}
        </div>
      </div>

      {/* Tab bar */}
      <div className="bg-white rounded-lg border border-[#e6e6e6] p-1">
        <div className="flex flex-col lg:flex-row gap-1">
          {Array.from({ length: tabs }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-md flex-1 justify-center">
              <Skeleton className="h-5 w-5 rounded shrink-0" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Content card */}
      <div className="bg-white rounded-lg border border-[#e6e6e6] p-6 space-y-5">
        <Skeleton className="h-5 w-44" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-28 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

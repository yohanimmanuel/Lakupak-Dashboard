/**
 * Skeleton for hub/nav pages:
 * Clients hub, Marketing hub
 *
 * Layout: header → tip banner → large navigation cards
 */
import { Skeleton } from '@/components/ui/Skeleton';

function NavCard() {
  return (
    <div className="rounded-xl border border-[#e6e6e6] bg-white p-6 flex items-start gap-4">
      <Skeleton className="h-12 w-12 rounded-xl shrink-0" />
      <div className="flex flex-col gap-2 flex-1">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-3.5 w-full max-w-xs" />
        <Skeleton className="h-3.5 w-3/4 max-w-xs" />
        <div className="flex items-center gap-2 mt-2">
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonHubPage({ cards = 3 }: { cards?: number }) {
  return (
    <div className="w-full p-4 space-y-5 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Tip / info banner */}
      <div className="rounded-lg border border-[#e6e6e6] bg-white p-4 flex gap-3">
        <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3.5 w-full max-w-sm" />
        </div>
        <Skeleton className="h-7 w-7 rounded-md shrink-0" />
      </div>

      {/* Navigation cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: cards }).map((_, i) => <NavCard key={i} />)}
      </div>
    </div>
  );
}

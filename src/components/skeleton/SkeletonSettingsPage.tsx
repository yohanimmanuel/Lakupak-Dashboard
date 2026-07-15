/**
 * Skeleton for the Settings page.
 * Layout: header → tabs → form sections with labels + inputs
 */
import { Skeleton } from '@/components/ui/Skeleton';

function FormGroup({ fields = 2 }: { fields?: number }) {
  return (
    <div className="py-5 border-b border-[#e6e6e6] last:border-0">
      <div className="mb-3">
        <Skeleton className="h-4 w-36 mb-1.5" />
        <Skeleton className="h-3.5 w-60" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonSettingsPage() {
  return (
    <div className="w-full p-4 space-y-5 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      {/* Header */}
      <div>
        <Skeleton className="h-7 w-36" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-[#e6e6e6] pb-0">
        {['General', 'Profile', 'Team', 'Language', 'Billing', 'Security'].map((_, i) => (
          <div key={i} className="px-4 py-2.5 border-b-2 shrink-0 border-transparent">
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>

      {/* Settings panel */}
      <div className="rounded-lg border border-[#e6e6e6] bg-white p-5">
        {/* Section header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#e6e6e6] mb-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>

        {/* Form groups */}
        <FormGroup fields={2} />
        <FormGroup fields={2} />
        <FormGroup fields={1} />

        {/* Save button */}
        <div className="pt-4 flex justify-end">
          <Skeleton className="h-10 w-28 rounded-lg" />
        </div>
      </div>

      {/* Second panel */}
      <div className="rounded-lg border border-[#e6e6e6] bg-white p-5">
        <Skeleton className="h-5 w-40 mb-4" />
        <FormGroup fields={2} />
        <FormGroup fields={1} />
        <div className="pt-4 flex justify-end">
          <Skeleton className="h-10 w-28 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

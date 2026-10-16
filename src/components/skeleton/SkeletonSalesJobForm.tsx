/**
 * Skeleton for the sales job create/edit form.
 * Header, sales rep card, then three job cards in a row.
 */
import { Skeleton } from '@/components/ui/Skeleton';

function Field({ className = '' }: { className?: string }) {
  return (
    <div className={className}>
      <Skeleton className="h-3 w-24 mb-2" />
      <Skeleton className="h-9 w-full rounded-lg" />
    </div>
  );
}

export function SkeletonSalesJobForm() {
  return (
    <div className="flex min-h-full w-full min-w-0 flex-col space-y-4 bg-gradient-to-b from-gray-50 to-white p-4" aria-hidden>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-28 rounded-lg" />
          <Skeleton className="h-8 w-28" />
        </div>
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>

      <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
        <Skeleton className="h-3 w-20 mb-2" />
        <Skeleton className="h-9 w-full rounded-lg" />
        <Skeleton className="h-3 w-64 mt-2" />
      </div>

      <div className="grid grid-cols-1 @5xl/main:grid-cols-3 gap-4">
        {Array.from({ length: 3 }, (_, index) => (
          <section key={index} className="bg-white rounded-lg border border-[#e6e6e6] h-[36rem]">
            <div className="flex flex-col gap-3 px-4 py-3 border-b border-[#e6e6e6]">
              <Skeleton className="h-4 w-14" />
              <div className="flex items-center gap-2 flex-wrap">
                <Skeleton className="h-9 w-28 rounded-lg" />
                <Skeleton className="h-9 w-28 rounded-lg" />
              </div>
            </div>
            <div className="p-4 space-y-4">
              <Field />
              <Field />
              <Field />
              <div>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="space-y-1">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-3 w-full max-w-40" />
                  </div>
                  <Skeleton className="h-8 w-20 rounded-lg shrink-0" />
                </div>
                <div className="rounded-lg border border-[#e6e6e6] overflow-hidden">
                  <div className="bg-gray-100 px-3 py-2 flex gap-4">
                    <Skeleton className="h-3 w-12" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <div className="px-3 py-2 flex gap-3">
                    <Skeleton className="h-9 flex-1 rounded-lg" />
                    <Skeleton className="h-9 flex-1 rounded-lg" />
                  </div>
                </div>
              </div>
            </div>
          </section>
        ))}
      </div>

      <Skeleton className="h-9 w-28 rounded-lg" />
    </div>
  );
}

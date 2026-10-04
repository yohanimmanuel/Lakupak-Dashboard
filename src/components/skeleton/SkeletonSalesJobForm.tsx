/**
 * Skeleton for the sales job create/edit form.
 * Header, sales rep card, then one job card with the outlet fields and date table.
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
    <div className="p-4 space-y-4 bg-gradient-to-b from-gray-50 to-white min-h-screen" aria-hidden>
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

      <section className="bg-white rounded-lg border border-[#e6e6e6]">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#e6e6e6]">
          <Skeleton className="h-4 w-14" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-32 rounded-lg" />
            <Skeleton className="h-9 w-32 rounded-lg" />
            <Skeleton className="h-4 w-14" />
          </div>
        </div>
        <div className="p-4 space-y-4">
          <Field />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field />
            <Field />
            <Field />
            <Field />
            <Field className="md:col-span-2" />
          </div>
          <Field />
          <div>
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="space-y-1">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-3 w-72 max-w-full" />
              </div>
              <Skeleton className="h-8 w-24 rounded-lg shrink-0" />
            </div>
            <div className="rounded-lg border border-[#e6e6e6] overflow-hidden">
              <div className="bg-gray-100 px-3 py-2 flex gap-4">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-32" />
              </div>
              <div className="px-3 py-2 flex gap-3">
                <Skeleton className="h-9 flex-1 rounded-lg" />
                <Skeleton className="h-9 flex-1 rounded-lg" />
                <Skeleton className="h-9 w-9 rounded-lg shrink-0" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <Skeleton className="h-9 w-28 rounded-lg" />
    </div>
  );
}

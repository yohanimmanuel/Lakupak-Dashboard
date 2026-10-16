/**
 * Skeleton for the edit order form while saved values are still loading.
 */
import { Skeleton } from '@/components/ui/Skeleton';

function Field() {
  return (
    <div>
      <Skeleton className="mb-2 h-3 w-24" />
      <Skeleton className="h-9 w-full rounded-lg" />
    </div>
  );
}

export function SkeletonOrderForm() {
  return (
    <div className="flex min-h-full w-full min-w-0 flex-col bg-gradient-to-b from-gray-50 to-white p-4" aria-busy="true" aria-live="polite">
      <div className="mx-auto w-full">
        <div className="rounded-lg border border-[#e6e6e6] bg-white">
          <div className="flex items-center justify-between gap-4 border-b border-[#e6e6e6] px-4 py-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-9 w-36 rounded-lg" />
              <Skeleton className="h-7 w-32" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-40 rounded-lg" />
              <Skeleton className="h-9 w-32 rounded-lg" />
              <Skeleton className="h-9 w-28 rounded-lg" />
            </div>
          </div>

          <section className="border-b border-[#e6e6e6] p-4">
            <Skeleton className="mb-4 h-4 w-40" />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field />
              </div>
              <Field />
              <Field />
              <Field />
              <Field />
              <Field />
            </div>
          </section>

          <section className="border-b border-[#e6e6e6] p-4">
            <div className="mb-4 flex items-center justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-8 w-28 rounded-lg" />
            </div>
            <div className="rounded-lg border border-[#e6e6e6] p-3">
              <div className="grid gap-3 md:grid-cols-[1.3fr_1fr_88px_auto]">
                <Field />
                <Field />
                <Field />
                <Field />
              </div>
            </div>
          </section>

          <section className="border-b border-[#e6e6e6] p-4">
            <Skeleton className="mb-4 h-4 w-28" />
            <Skeleton className="mb-4 h-8 w-36" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field />
              <Field />
              <Field />
              <Field />
            </div>
            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
              <Skeleton className="mb-4 h-4 w-32" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field />
                <Field />
                <Field />
                <Field />
              </div>
            </div>
          </section>

          <section className="p-4">
            <Skeleton className="mb-4 h-4 w-36" />
            <Field />
            <Skeleton className="mt-3 h-[280px] w-full rounded-lg" />
            <div className="mt-4">
              <Field />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

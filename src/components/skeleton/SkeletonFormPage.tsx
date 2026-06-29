/**
 * Skeleton for create/edit/wizard pages:
 * Add Product, Edit Product, Create Campaign, Create Fleet, etc.
 *
 * Layout: header with back button → tab bar → form fields
 */
import { Skeleton } from '@/components/ui/Skeleton';

function FormField({ wide = false }: { wide?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className={`h-10 rounded-lg ${wide ? 'w-full' : 'w-full max-w-sm'}`} />
    </div>
  );
}

export function SkeletonFormPage({ tabs = 4, fields = 6 }: { tabs?: number; fields?: number }) {
  return (
    <div className="w-full p-4 space-y-5 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-6 w-44" />
            <Skeleton className="h-3.5 w-60" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 overflow-x-auto border-b border-[#e6e6e6]">
        {Array.from({ length: tabs }).map((_, i) => (
          <div
            key={i}
            className={`shrink-0 px-5 py-2.5 border-b-2 ${i === 0 ? 'border-[#0a61d7]' : 'border-transparent'}`}
          >
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>

      {/* Form panel */}
      <div className="rounded-lg border border-[#e6e6e6] bg-white p-6 space-y-5">
        <Skeleton className="h-5 w-36 mb-2" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {Array.from({ length: fields }).map((_, i) => (
            <FormField key={i} wide={i % 3 === 0} />
          ))}
        </div>

        {/* Textarea-like field */}
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>

        {/* Image / file upload area */}
        <div className="rounded-lg border-2 border-dashed border-[#e6e6e6] p-8 flex flex-col items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-xl" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3.5 w-36" />
          <Skeleton className="h-9 w-28 rounded-lg mt-1" />
        </div>
      </div>
    </div>
  );
}

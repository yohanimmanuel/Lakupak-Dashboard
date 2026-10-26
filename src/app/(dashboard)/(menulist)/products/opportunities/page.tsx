'use client';

import { useProductsTranslations } from '@/hooks/useProductsTranslations';

export default function ProductsOpportunitiesPage() {
  const { tHub } = useProductsTranslations();

  return (
    <div className="flex min-h-full w-full min-w-0 flex-col bg-gradient-to-b from-gray-50 to-white p-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-black mb-2">{tHub('toolsList.opportunities.name')}</h1>
        <p className="text-sm text-gray-600 max-w-2xl">{tHub('placeholders.opportunities')}</p>
      </div>

      <div className="rounded-lg border border-dashed border-[#e6e6e6] bg-white p-10 text-center">
        <p className="text-sm text-gray-500">{tHub('placeholders.comingSoon')}</p>
      </div>
    </div>
  );
}

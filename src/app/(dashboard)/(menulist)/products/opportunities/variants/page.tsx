'use client';

import { Suspense } from 'react';
import SkuVariantAnalysis from '@/components/productscatalogs/SkuVariantAnalysis';

export default function SkuVariantAnalysisPage() {
  return (
    <div className="flex min-h-full w-full min-w-0 flex-col bg-gradient-to-b from-gray-50 to-white p-4">
      <Suspense>
        <SkuVariantAnalysis />
      </Suspense>
    </div>
  );
}

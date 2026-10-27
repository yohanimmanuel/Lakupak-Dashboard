'use client';

import AssortmentGapHeatmap from '@/components/productscatalogs/AssortmentGapHeatmap';

export default function ProductsHeatmapPage() {
  return (
    <div className="flex min-h-full w-full min-w-0 flex-col bg-gradient-to-b from-gray-50 to-white p-4">
      <AssortmentGapHeatmap />
    </div>
  );
}

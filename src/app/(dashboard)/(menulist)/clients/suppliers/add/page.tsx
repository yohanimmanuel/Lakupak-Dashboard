'use client';

import SupplierModal from '@/components/clientmanagement/SupplierModal';

export default function AddSupplierPage() {
  return (
    <div className="flex min-h-full w-full min-w-0 flex-col bg-gradient-to-b from-gray-50 to-white p-4">
      <SupplierModal mode="add" />
    </div>
  );
}

'use client';

import React from 'react';
import PlatformAdminsTable from '@/components/adminstuffs/PlatformAdminsTable';

export default function PlatformAdminsPage() {
  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Platform admins</h1>
          <p className="text-sm text-gray-600 mt-1">
            Manage who can access the platform admin area. Use the table to review accounts; add new admins from the
            modal.
          </p>
        </div>
      </div>

      <PlatformAdminsTable />
    </div>
  );
}

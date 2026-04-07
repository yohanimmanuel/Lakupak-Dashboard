'use client';

import React from 'react';
import ManageUsersTable from '@/components/adminstuffs/ManageUsersTable';

export default function AdminUsersPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Manage users</h1>
          <p className="text-sm text-gray-600 mt-1">
            View distributors (dashboard), marketplace accounts, and drivers in one place.
          </p>
        </div>
      </div>

      <ManageUsersTable />
    </div>
  );
}

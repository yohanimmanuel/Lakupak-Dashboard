'use client';

import React from 'react';

export default function AdminUsersPage() {
  return (
    <div className="space-y-3">
      <div className="bg-white border border-[#e6e6e6] rounded-xl p-4">
        <p className="text-sm font-semibold text-gray-900">Manage users</p>
        <p className="text-xs text-gray-600 mt-1">
          Search distributors and marketplace users, view status, and manage suspensions (coming next).
        </p>
      </div>

      <div className="bg-white border border-[#e6e6e6] rounded-xl p-6 text-sm text-gray-600">
        This page is a placeholder for the MVP navigation. Next we’ll add:
        <ul className="list-disc pl-5 mt-2 space-y-1 text-sm">
          <li>Distributor (`User`) lookup by email/name</li>
          <li>Marketplace user lookup by phone/email</li>
          <li>Suspend / unsuspend actions</li>
          <li>Audit trail</li>
        </ul>
      </div>
    </div>
  );
}


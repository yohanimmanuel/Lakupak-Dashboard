'use client';

import React from 'react';

export default function AdminAnalyticsPage() {
  return (
    <div className="space-y-3">
      <div className="bg-white border border-[#e6e6e6] rounded-xl p-4">
        <p className="text-sm font-semibold text-gray-900">Platform analytics</p>
        <p className="text-xs text-gray-600 mt-1">
          Track marketplace behavior across users (views, favorites, carts, orders) — platform-wide.
        </p>
      </div>

      <div className="bg-white border border-[#e6e6e6] rounded-xl p-6 text-sm text-gray-600">
        Placeholder page. Next we’ll wire real metrics from the database, e.g.:
        <ul className="list-disc pl-5 mt-2 space-y-1 text-sm">
          <li>Total daily views / favorites / cart adds</li>
          <li>Top products by engagement</li>
          <li>Conversion funnels</li>
          <li>Notification reach (announcements vs pushes)</li>
        </ul>
      </div>
    </div>
  );
}


'use client';

import React, { useEffect, useState } from 'react';
import PlatformAdminHomeDashboard, {
  type PlatformAdminHomeMetrics,
} from '@/components/adminstuffs/PlatformAdminHomeDashboard';

export default function PlatformAdminHomePage() {
  const [metrics, setMetrics] = useState<PlatformAdminHomeMetrics | null>(null);

  useEffect(() => {
    fetch('/api/platform-admin/metrics')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setMetrics((d?.metrics as PlatformAdminHomeMetrics) ?? null))
      .catch(() => setMetrics(null));
  }, []);

  return <PlatformAdminHomeDashboard metrics={metrics} />;
}

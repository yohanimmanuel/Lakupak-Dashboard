'use client';

import { useTranslations } from 'next-intl';

export default function SalesJobsPage() {
  const t = useTranslations('dashboard.nav');

  return (
    <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      <h1 className="text-2xl font-bold text-black">{t('jobs')}</h1>
    </div>
  );
}

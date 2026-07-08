'use client';

import React from 'react';
import { useAutomationTranslations } from '@/hooks/useAutomationTranslations';

export default function AutomationPage() {
  const { tPage } = useAutomationTranslations();

  return (
    <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{tPage('title')}</h1>
        <p className="text-sm text-gray-600">{tPage('subtitle')}</p>
      </div>
    </div>
  );
}

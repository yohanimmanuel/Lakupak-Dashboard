"use client";

import { useTranslations } from 'next-intl';

export default function PrivacyPolicyPage() {
  const t = useTranslations('legal');

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-5xl font-bold mb-6 text-black text-center animate-fade-in-up">
        {t('privacy.title')}
      </h1>
        <p className="text-center text-lg text-gray-700 mb-6 animate-fade-in-up">{t('privacy.updated')}</p>
      <div className="mt-8 prose text-gray-700 whitespace-pre-line animate-fade-in-up">
          {t('privacy.content')}
      </div>
    </div>
  );
}

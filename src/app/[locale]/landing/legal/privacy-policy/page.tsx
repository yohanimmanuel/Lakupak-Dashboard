"use client";

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslations } from 'next-intl';

export default function PrivacyPolicyPage() {
  const t = useTranslations('legal');

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="mb-6 animate-fade-in-up text-center text-4xl font-bold text-black md:text-5xl">
        {t('privacy.title')}
      </h1>
      <p className="mb-6 animate-fade-in-up text-center text-lg text-gray-700">
        {t('privacy.updated')}
      </p>
      <div className="prose prose-gray mt-8 max-w-none animate-fade-in-up prose-headings:scroll-mt-24 prose-headings:text-black prose-a:text-[#0a61d7]">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{t('privacy.content')}</ReactMarkdown>
      </div>
    </div>
  );
}

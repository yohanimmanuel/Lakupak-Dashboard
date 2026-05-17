import { DocsCategoryGrid, DocsLandingHero } from '@/components/docs/DocsLandingHero';
import type { DocLocale } from '@/lib/docs/types';
import { notFound } from 'next/navigation';

export default async function DocsLandingPage(props: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await props.params;
  const locale = raw === 'id' ? 'id' : raw === 'en' ? 'en' : null;
  if (!locale) notFound();

  return (
    <>
      <DocsLandingHero locale={locale as DocLocale} />
      <DocsCategoryGrid locale={locale as DocLocale} />
    </>
  );
}

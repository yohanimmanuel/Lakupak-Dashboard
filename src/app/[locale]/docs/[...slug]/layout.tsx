import { DocsSidebar } from '@/components/docs/DocsSidebar';
import { getDocsNav } from '@/lib/docs/load';
import { DOCS_VIEWPORT_CALC } from '@/lib/docs/headerHeight';
import type { DocLocale } from '@/lib/docs/types';

export default async function DocArticleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = (raw === 'id' ? 'id' : 'en') as DocLocale;
  const nav = getDocsNav(locale);

  return (
    <div className="flex w-full" style={{ height: DOCS_VIEWPORT_CALC }}>
      <div className="flex h-full">
        <DocsSidebar locale={locale} sections={nav} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}

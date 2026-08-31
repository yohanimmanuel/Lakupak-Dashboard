import { notFound } from 'next/navigation';
import { getDocBySlug, getDocsNav, getAllDocs, DOC_LOCALES } from '@/lib/docs/load';
import type { DocLocale } from '@/lib/docs/types';
import { DocsSidebar } from '@/components/docs/DocsSidebar';
import { DocsMarkdown } from '@/components/docs/DocsMarkdown';
import { DocsTableOfContents } from '@/components/docs/DocsTableOfContents';
import { DocsBreadcrumb } from '@/components/docs/DocsBreadcrumb';
import { DOCS_VIEWPORT_CALC } from '@/lib/docs/headerHeight';
import type { Metadata } from 'next';

export function generateStaticParams() {
  const params: { locale: string; slug: string[] }[] = [];
  for (const locale of DOC_LOCALES) {
    for (const doc of getAllDocs(locale)) {
      params.push({ locale, slug: doc.slug });
    }
  }
  return params;
}

export async function generateMetadata(props: {
  params: Promise<{ locale: string; slug: string[] }>;
}): Promise<Metadata> {
  const { locale: raw, slug } = await props.params;
  const locale = (raw === 'id' ? 'id' : 'en') as DocLocale;
  const doc = getDocBySlug(locale, slug);
  if (!doc) return { title: 'Documentation | Lakupak' };
  return {
    title: `${doc.frontmatter.title} | Lakupak Docs`,
    description: doc.frontmatter.description,
  };
}

export default async function DocArticlePage(props: {
  params: Promise<{ locale: string; slug: string[] }>;
}) {
  const { locale: raw, slug } = await props.params;
  const locale = raw === 'id' ? 'id' : raw === 'en' ? 'en' : null;
  if (!locale) notFound();

  const doc = getDocBySlug(locale as DocLocale, slug);
  if (!doc) notFound();

  const nav = getDocsNav(locale as DocLocale);

  return (
    <div className="flex w-full" style={{ height: DOCS_VIEWPORT_CALC }}>
      <div className="flex h-full">
        <DocsSidebar locale={locale as DocLocale} sections={nav} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-w-0 flex-1 w-full flex-col px-6 py-6 lg:px-10 overflow-auto">
          <DocsBreadcrumb
            locale={locale as DocLocale}
            section={doc.frontmatter.section}
            title={doc.frontmatter.title}
          />
          <div className="mt-6 flex w-full min-w-0 gap-8 xl:gap-12">
            <div className="min-w-0 flex-1 w-full">
              <header className="mb-8 border-b border-gray-100 pb-6">
                <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
                  {doc.frontmatter.title}
                </h1>
                {doc.frontmatter.description ? (
                  <p className="mt-2 text-base leading-relaxed text-gray-600">
                    {doc.frontmatter.description}
                  </p>
                ) : null}
              </header>
              <DocsMarkdown content={doc.content} />
            </div>
            <DocsTableOfContents headings={doc.headings} slugPath={doc.slugPath} />
          </div>
        </div>
      </div>
    </div>
  );
}

import Link from 'next/link';
import type { DocLocale } from '@/lib/docs/types';

export function DocsBreadcrumb({
  locale,
  section,
  title,
}: {
  locale: DocLocale;
  section?: string;
  title: string;
}) {
  return (
    <nav className="text-sm text-gray-500" aria-label="Breadcrumb">
      <Link href={`/${locale}/docs`} className="hover:text-[#0a61d7]">
        Docs
      </Link>
      {section ? (
        <>
          <span className="mx-2">/</span>
          <span className="text-gray-600">{section}</span>
        </>
      ) : null}
      <span className="mx-2">/</span>
      <span className="text-gray-900 font-medium">{title}</span>
    </nav>
  );
}

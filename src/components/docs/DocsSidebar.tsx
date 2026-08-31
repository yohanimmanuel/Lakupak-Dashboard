'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { DocsNavSection, DocLocale } from '@/lib/docs/types';

export function DocsSidebar({
  locale,
  sections,
}: {
  locale: DocLocale;
  sections: DocsNavSection[];
}) {
  const pathname = usePathname();

  return (
    <aside className="w-60 shrink-0 border-r border-gray-200 bg-gray-50/80 h-full overflow-y-auto">
      <div className="bg-[#0a61d7] px-4 py-3">
        <Link href={`/${locale}/docs`} className="text-sm font-semibold text-white hover:text-blue-100">
          Lakupak Docs
        </Link>
      </div>
      <nav className="p-3 space-y-5">
        {sections.map((section) => (
          <div key={section.id}>
            <p className="px-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              {section.title}
            </p>
            <ul className="mt-1 space-y-0.5">
              {section.items.map((item) => {
                const href = `/${locale}/docs/${item.slug}`;
                const active = pathname === href;
                return (
                  <li key={item.slug}>
                    <Link
                      href={href}
                      className={`block rounded-md px-2 py-1.5 text-sm font-normal transition-colors ${
                        active
                          ? 'bg-white font-medium text-[#0a61d7] shadow-sm ring-1 ring-gray-200'
                          : 'text-gray-700 hover:bg-white/80 hover:text-gray-900'
                      }`}
                    >
                      {item.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}

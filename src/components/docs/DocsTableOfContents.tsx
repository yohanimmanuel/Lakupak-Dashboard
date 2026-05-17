'use client';

import type { DocHeading } from '@/lib/docs/types';

export function DocsTableOfContents({ headings }: { headings: DocHeading[] }) {
  const items = headings.filter((h) => h.level === 2 || h.level === 3);
  if (items.length === 0) return null;

  return (
    <aside className="hidden xl:block w-56 shrink-0 self-start sticky top-24 pr-6 lg:pr-8">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">On this page</p>
      <ul className="mt-3 space-y-2 border-l border-gray-200">
        {items.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              className={`block border-l-2 py-0.5 text-sm text-gray-600 hover:text-[#0a61d7] transition-colors ${
                h.level === 3 ? 'pl-5 border-transparent' : 'pl-3 -ml-px border-transparent hover:border-[#0a61d7]'
              }`}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}

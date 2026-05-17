'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { DocHeading } from '@/lib/docs/types';

type TocSection = {
  heading: DocHeading;
  children: DocHeading[];
};

function buildSections(headings: DocHeading[]): TocSection[] {
  const sections: TocSection[] = [];
  let current: TocSection | null = null;

  for (const h of headings) {
    if (h.level === 2) {
      current = { heading: h, children: [] };
      sections.push(current);
      continue;
    }
    if (h.level === 3 && current) {
      current.children.push(h);
    }
  }

  return sections;
}

const linkClass =
  'block border-l-2 py-0.5 text-sm text-gray-600 hover:text-[#0a61d7] transition-colors pl-3 -ml-px border-transparent hover:border-[#0a61d7]';

const childLinkClass =
  'block border-l-2 py-0.5 pl-4 text-sm text-gray-600 hover:text-[#0a61d7] transition-colors border-transparent hover:border-[#0a61d7]';

export function DocsTableOfContents({
  headings,
  slugPath,
}: {
  headings: DocHeading[];
  slugPath?: string;
}) {
  const t = useTranslations('docs.toc');

  const sections = useMemo(() => {
    const items = headings.filter((h) => h.level === 2 || h.level === 3);
    return buildSections(items);
  }, [headings]);

  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setOpenIds(new Set());
  }, [slugPath]);

  if (sections.length === 0) return null;

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <aside className="hidden xl:block w-56 shrink-0 self-start sticky top-24 pr-6 lg:pr-8">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('onThisPage')}</p>
      <ul className="mt-3 space-y-2 border-l border-gray-200">
        {sections.map((section) => {
          const { heading, children } = section;
          const hasChildren = children.length > 0;
          const isOpen = openIds.has(heading.id);

          if (!hasChildren) {
            return (
              <li key={heading.id}>
                <a href={`#${heading.id}`} className={linkClass}>
                  {heading.text}
                </a>
              </li>
            );
          }

          const panelId = `toc-panel-${heading.id}`;
          const toggleLabel = isOpen ? t('collapse') : t('expand');

          return (
            <li key={heading.id}>
              <div className="flex items-start justify-between gap-1 -ml-px">
                <a href={`#${heading.id}`} className={`${linkClass} min-w-0 flex-1 font-medium`}>
                  {heading.text}
                </a>
                <button
                  type="button"
                  onClick={() => toggle(heading.id)}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  aria-label={`${toggleLabel}: ${heading.text}`}
                  className="mt-0.5 shrink-0 rounded p-0.5 text-gray-500 hover:bg-gray-100 hover:text-[#0a61d7] transition-colors"
                >
                  {isOpen ? (
                    <ChevronUp className="h-4 w-4" aria-hidden />
                  ) : (
                    <ChevronDown className="h-4 w-4" aria-hidden />
                  )}
                </button>
              </div>
              <ul
                id={panelId}
                className={`mt-1 space-y-1.5 border-l border-gray-200 ml-3 overflow-hidden transition-[max-height,opacity] duration-200 ease-out ${
                  isOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0 pointer-events-none'
                }`}
                aria-hidden={!isOpen}
              >
                {children.map((child) => (
                  <li key={child.id}>
                    <a href={`#${child.id}`} className={childLinkClass} tabIndex={isOpen ? undefined : -1}>
                      {child.text}
                    </a>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

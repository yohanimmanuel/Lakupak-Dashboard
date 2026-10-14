import { docUrl, getAllDocs, getDocsNav, isPausedMarketplaceDoc, stripMarkdownToPlainText } from './load';
import type { DocLocale } from './types';

export type DocsSearchHit = {
  id: string;
  title: string;
  description?: string;
  url: string;
  section?: string;
  module?: string;
  snippet?: string;
};

function buildSnippet(plain: string, term: string): string | undefined {
  const lower = plain.toLowerCase();
  const idx = lower.indexOf(term.toLowerCase());
  if (idx < 0) return undefined;
  const start = Math.max(0, idx - 50);
  const end = Math.min(plain.length, idx + term.length + 80);
  const slice = plain.slice(start, end).trim();
  return (start > 0 ? '…' : '') + slice + (end < plain.length ? '…' : '');
}

function scorePage(
  query: string,
  terms: string[],
  fields: {
    title: string;
    navTitle: string;
    slug: string;
    slugLabel: string;
    section: string;
    module: string;
    description: string;
    plain: string;
    headings: string;
  },
): number {
  const q = query.toLowerCase();
  let score = 0;

  const title = fields.title.toLowerCase();
  const navTitle = fields.navTitle.toLowerCase();
  const slug = fields.slug.toLowerCase();
  const slugLabel = fields.slugLabel.toLowerCase();
  const section = fields.section.toLowerCase();
  const module = fields.module.toLowerCase();
  const description = fields.description.toLowerCase();
  const plain = fields.plain.toLowerCase();
  const headings = fields.headings.toLowerCase();

  if (title.includes(q)) score += 120;
  if (navTitle.includes(q)) score += 115;
  if (slug.includes(q)) score += 100;
  if (slugLabel.includes(q)) score += 95;
  if (module.includes(q)) score += 90;
  if (section.includes(q)) score += 85;
  if (description.includes(q)) score += 70;
  if (headings.includes(q)) score += 55;
  if (plain.includes(q)) score += 35;

  for (const term of terms) {
    if (title.includes(term)) score += 28;
    if (navTitle.includes(term)) score += 26;
    if (slug.includes(term)) score += 24;
    if (slugLabel.includes(term)) score += 22;
    if (module.includes(term)) score += 20;
    if (section.includes(term)) score += 18;
    if (description.includes(term)) score += 14;
    if (headings.includes(term)) score += 12;
    if (plain.includes(term)) score += 8;
  }

  return score;
}

/** Search documentation from markdown on disk (works without Meilisearch). */
export function searchDocsLocal(
  locale: DocLocale,
  query: string,
  limit = 12,
): DocsSearchHit[] {
  const q = query.trim();
  if (q.length < 2) return [];

  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const pages = getAllDocs(locale);
  const nav = getDocsNav(locale);

  const navTitles = new Map<string, string>();
  for (const section of nav) {
    for (const item of section.items) {
      navTitles.set(item.slug, item.title);
    }
  }

  const ranked: { score: number; hit: DocsSearchHit }[] = [];

  for (const page of pages) {
    if (isPausedMarketplaceDoc(page.slugPath, page.frontmatter.module)) continue;
    const title = page.frontmatter.title;
    const navTitle = navTitles.get(page.slugPath) ?? title;
    const slug = page.slugPath;
    const slugLabel = slug.replace(/\//g, ' ');
    const plain = stripMarkdownToPlainText(page.content);
    const headings = page.headings.map((h) => h.text).join(' ');

    const score = scorePage(q, terms, {
      title,
      navTitle,
      slug,
      slugLabel,
      section: page.frontmatter.section,
      module: page.frontmatter.module,
      description: page.frontmatter.description ?? '',
      plain,
      headings,
    });

    if (score <= 0) continue;

    const primaryTerm = terms[0] ?? q.toLowerCase();
    ranked.push({
      score,
      hit: {
        id: `${locale}:${slug}`,
        title,
        description: page.frontmatter.description,
        url: docUrl(locale, slug),
        section: page.frontmatter.section,
        module: page.frontmatter.module,
        snippet:
          buildSnippet(plain, primaryTerm) ??
          page.frontmatter.description ??
          undefined,
      },
    });
  }

  ranked.sort((a, b) => b.score - a.score || a.hit.title.localeCompare(b.hit.title));
  return ranked.slice(0, limit).map((r) => r.hit);
}

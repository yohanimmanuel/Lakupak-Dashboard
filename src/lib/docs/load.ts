import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import type { DocFrontmatter, DocLocale, DocPage, DocsNavSection, DocModule } from './types';
import { extractHeadings } from './headings';

const CONTENT_ROOT = path.join(process.cwd(), 'content', 'docs');

export const DOC_LOCALES: DocLocale[] = ['en', 'id'];

function localeDir(locale: DocLocale): string {
  return path.join(CONTENT_ROOT, locale);
}

function parseFrontmatter(data: Record<string, unknown>, slugPath: string): DocFrontmatter {
  const title = typeof data.title === 'string' ? data.title : slugPath;
  const description = typeof data.description === 'string' ? data.description : '';
  const section = typeof data.section === 'string' ? data.section : 'General';
  const module = (typeof data.module === 'string' ? data.module : 'overview') as DocModule;
  const order = typeof data.order === 'number' ? data.order : undefined;
  return { title, description, section, module, order };
}

function readMarkdownFile(filePath: string, locale: DocLocale, slugParts: string[]): DocPage | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const { data, content } = matter(raw);
    const slugPath = slugParts.join('/');
    const frontmatter = parseFrontmatter(data as Record<string, unknown>, slugPath);
    return {
      locale,
      slug: slugParts,
      slugPath,
      frontmatter,
      content,
      headings: extractHeadings(content),
    };
  } catch {
    return null;
  }
}

function walkMarkdownFiles(dir: string, locale: DocLocale, prefix: string[] = []): DocPage[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const pages: DocPage[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith('_')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      pages.push(...walkMarkdownFiles(full, locale, [...prefix, entry.name]));
    } else if (entry.name.endsWith('.md')) {
      const base = entry.name.replace(/\.md$/, '');
      const slugParts = [...prefix, base];
      const page = readMarkdownFile(full, locale, slugParts);
      if (page) pages.push(page);
    }
  }
  return pages;
}

export function getAllDocs(locale: DocLocale): DocPage[] {
  const pages = walkMarkdownFiles(localeDir(locale), locale);
  return pages.sort((a, b) => {
    const orderA = a.frontmatter.order ?? 999;
    const orderB = b.frontmatter.order ?? 999;
    if (orderA !== orderB) return orderA - orderB;
    return a.slugPath.localeCompare(b.slugPath);
  });
}

export function getDocBySlug(locale: DocLocale, slug: string[]): DocPage | null {
  if (slug.length === 0) return null;
  const filePath = path.join(localeDir(locale), ...slug) + '.md';
  if (!fs.existsSync(filePath)) return null;
  return readMarkdownFile(filePath, locale, slug);
}

/** Marketplace pages stay on disk. They are omitted from the docs sidebar until demand is validated. */
export function isPausedMarketplaceDoc(slugPath: string, module?: string): boolean {
  if (module === 'marketplace') return true;
  if (slugPath.startsWith('marketplace/')) return true;
  if (slugPath.includes('marketplace')) return true;
  return false;
}

export function getDocsNav(locale: DocLocale): DocsNavSection[] {
  const metaPath = path.join(localeDir(locale), '_meta.json');
  if (fs.existsSync(metaPath)) {
    try {
      const raw = fs.readFileSync(metaPath, 'utf8');
      const parsed = JSON.parse(raw) as { sections?: DocsNavSection[] };
      if (parsed.sections?.length) {
        return parsed.sections
          .filter((section) => section.id !== 'marketplace')
          .map((section) => ({
            ...section,
            items: section.items.filter((item) => !isPausedMarketplaceDoc(item.slug)),
          }))
          .filter((section) => section.items.length > 0);
      }
    } catch {
      /* fall through */
    }
  }

  const pages = getAllDocs(locale).filter(
    (page) => !isPausedMarketplaceDoc(page.slugPath, page.frontmatter.module),
  );
  const bySection = new Map<string, DocPage[]>();
  for (const page of pages) {
    const key = page.frontmatter.section;
    if (!bySection.has(key)) bySection.set(key, []);
    bySection.get(key)!.push(page);
  }

  return Array.from(bySection.entries()).map(([title, sectionPages]) => ({
    id: title.toLowerCase().replace(/\s+/g, '-'),
    title,
    items: sectionPages.map((p) => ({
      slug: p.slugPath,
      title: p.frontmatter.title,
    })),
  }));
}

export function stripMarkdownToPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*?|__|\[|\]|\(|\)|>|#/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function docUrl(locale: DocLocale, slugPath: string): string {
  return `/${locale}/docs/${slugPath}`;
}

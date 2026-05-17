/**
 * Index documentation markdown into Meilisearch (laku_docs).
 * Run: npm run docs:index
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { getMeiliClient, MEILI_DOCS_INDEX } from '../lib/meili';
import { stripMarkdownToPlainText, docUrl } from '../lib/docs/load';
import { extractHeadings } from '../lib/docs/headings';
import type { DocLocale } from '../lib/docs/types';

const CONTENT_ROOT = path.join(process.cwd(), 'content', 'docs');
const LOCALES: DocLocale[] = ['en', 'id'];

type DocRecord = {
  id: string;
  locale: string;
  title: string;
  description: string;
  section: string;
  module: string;
  content: string;
  url: string;
  headings: string[];
};

function walk(dir: string, locale: DocLocale, prefix: string[] = []): DocRecord[] {
  if (!fs.existsSync(dir)) return [];
  const out: DocRecord[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('_')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full, locale, [...prefix, entry.name]));
    } else if (entry.name.endsWith('.md')) {
      const slugParts = [...prefix, entry.name.replace(/\.md$/, '')];
      const slugPath = slugParts.join('/');
      const raw = fs.readFileSync(full, 'utf8');
      const { data, content } = matter(raw);
      const title = typeof data.title === 'string' ? data.title : slugPath;
      const description = typeof data.description === 'string' ? data.description : '';
      const section = typeof data.section === 'string' ? data.section : 'General';
      const module = typeof data.module === 'string' ? data.module : 'overview';
      const plain = stripMarkdownToPlainText(content);
      const headings = extractHeadings(content).map((h) => h.text);
      out.push({
        id: `${locale}:${slugPath}`,
        locale,
        title,
        description,
        section,
        module,
        content: plain,
        url: docUrl(locale, slugPath),
        headings,
      });
    }
  }
  return out;
}

async function main() {
  const client = getMeiliClient();
  if (!client) {
    console.error('MEILI_HOST is not set. Skipping docs index.');
    process.exit(1);
  }

  const documents: DocRecord[] = [];
  for (const locale of LOCALES) {
    documents.push(...walk(path.join(CONTENT_ROOT, locale), locale));
  }

  if (documents.length === 0) {
    console.warn('No documentation files found under content/docs');
    process.exit(0);
  }

  const index = client.index(MEILI_DOCS_INDEX);
  try {
    await index.updateFilterableAttributes(['locale', 'module', 'section']);
    await index.updateSearchableAttributes(['title', 'description', 'content', 'headings']);
  } catch {
    /* index may not exist yet */
  }

  await index.addDocuments(documents, { primaryKey: 'id' });
  console.log(`Indexed ${documents.length} documentation pages into "${MEILI_DOCS_INDEX}".`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

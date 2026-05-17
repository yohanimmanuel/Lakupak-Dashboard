import GithubSlugger from 'github-slugger';
import type { DocHeading } from './types';

/** Extract h2/h3 headings from markdown for the right-rail TOC. */
export function extractHeadings(markdown: string): DocHeading[] {
  const headings: DocHeading[] = [];
  const slugger = new GithubSlugger();
  const lines = markdown.split('\n');
  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      const text = h2[1].trim();
      headings.push({ level: 2, text, id: slugger.slug(text) });
      continue;
    }
    const h3 = line.match(/^###\s+(.+)$/);
    if (h3) {
      const text = h3[1].trim();
      headings.push({ level: 3, text, id: slugger.slug(text) });
    }
  }
  return headings;
}

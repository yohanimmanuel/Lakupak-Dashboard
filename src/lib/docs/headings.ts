import type { DocHeading } from './types';

/** Extract h2/h3 headings from markdown for the right-rail TOC. */
export function extractHeadings(markdown: string): DocHeading[] {
  const headings: DocHeading[] = [];
  const lines = markdown.split('\n');
  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      headings.push({ level: 2, text: h2[1].trim(), id: slugifyHeading(h2[1]) });
      continue;
    }
    const h3 = line.match(/^###\s+(.+)$/);
    if (h3) {
      headings.push({ level: 3, text: h3[1].trim(), id: slugifyHeading(h3[1]) });
    }
  }
  return headings;
}

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

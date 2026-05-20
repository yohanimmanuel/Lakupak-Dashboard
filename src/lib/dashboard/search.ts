import { DASHBOARD_SEARCH_CATALOG, type DashboardSearchEntry } from './searchCatalog';

export type DashboardSearchHit = {
  id: string;
  title: string;
  description?: string;
  url: string;
  section?: string;
  snippet?: string;
};

function scoreEntry(query: string, terms: string[], entry: DashboardSearchEntry): number {
  const q = query.toLowerCase();
  let score = 0;

  const title = entry.title.toLowerCase();
  const description = entry.description.toLowerCase();
  const section = entry.section.toLowerCase();
  const href = entry.href.toLowerCase();
  const keywords = entry.keywords.join(' ').toLowerCase();

  if (title.includes(q)) score += 120;
  if (href.includes(q)) score += 100;
  if (section.includes(q)) score += 85;
  if (description.includes(q)) score += 70;
  if (keywords.includes(q)) score += 60;

  for (const term of terms) {
    if (title.includes(term)) score += 28;
    if (href.includes(term)) score += 24;
    if (section.includes(term)) score += 18;
    if (description.includes(term)) score += 14;
    if (keywords.includes(term)) score += 12;
  }

  return score;
}

function buildSnippet(text: string, term: string): string | undefined {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(term.toLowerCase());
  if (idx < 0) return undefined;
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + term.length + 60);
  const slice = text.slice(start, end).trim();
  return (start > 0 ? '…' : '') + slice + (end < text.length ? '…' : '');
}

/** Search dashboard pages only (local catalog; never includes /docs). */
export function searchDashboard(query: string, limit = 8): DashboardSearchHit[] {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  let terms = trimmed
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  if (terms.length === 0) {
    terms = [trimmed.toLowerCase()];
  }

  const scored = DASHBOARD_SEARCH_CATALOG.map((entry) => ({
    entry,
    score: scoreEntry(trimmed, terms, entry),
  }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const primaryTerm = terms[0] ?? trimmed;

  return scored.map(({ entry }) => ({
    id: entry.id,
    title: entry.title,
    description: entry.description,
    url: entry.href,
    section: entry.section,
    snippet:
      buildSnippet(entry.description, primaryTerm) ??
      buildSnippet(entry.keywords.join(', '), primaryTerm),
  }));
}

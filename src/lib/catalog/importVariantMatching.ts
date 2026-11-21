/**
 * Normalize explicit "Attribute: Value | Attribute: Value" variant labels
 * without fuzzy guesses. Supports localized attribute names and reordering.
 * Do not infer a catalog identity from an unmatched SKU without a unique
 * product + variant match.
 */
export function normalizeImportVariant(value: unknown): string {
  const raw = String(value ?? '').trim().toLocaleLowerCase();
  const aliases: Record<string, string> = {
    ukuran: 'size', size: 'size',
    warna: 'colour', color: 'colour', colour: 'colour',
    rasa: 'flavour', flavor: 'flavour', flavour: 'flavour',
  };
  const parts = raw.split('|').map((part) => part.trim().replace(/\s+/g, ' ')).filter(Boolean);
  if (!parts.length) return '';
  const attributes = parts.map((part) => {
    const colon = part.indexOf(':');
    if (colon < 0) return null;
    const key = part.slice(0, colon).trim();
    const val = part.slice(colon + 1).trim();
    if (!key || !val) return null;
    return `${aliases[key] || key}:${val}`;
  });
  if (attributes.every((attribute) => attribute !== null)) {
    return (attributes as string[]).sort().join('|');
  }
  return raw.replace(/\s*\|\s*/g, '|').replace(/\s+/g, ' ');
}

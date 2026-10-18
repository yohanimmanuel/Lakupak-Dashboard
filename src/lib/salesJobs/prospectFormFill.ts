/** Client-safe prospect fill helpers. Do not import server-only modules here. */

export type ProspectFormFill = {
  buyerId: string | null;
  customerNumber: string;
  name: string;
  storeName: string;
  phone: string;
  address: string;
  region: string;
  buyerType: string;
  notes: string;
};

const PROSPECTS_MARK = '<!--laku-prospects:';
const PROSPECTS_STRIP = /\n*<!--laku-prospects:[\s\S]*-->\s*$/;

function clip(value: string, max: number) {
  return value.trim().slice(0, max);
}

function sanitizeFill(fill: ProspectFormFill): ProspectFormFill {
  return {
    buyerId: fill.buyerId?.trim() || null,
    customerNumber: clip(fill.customerNumber || '', 50),
    name: clip(fill.name || '', 100),
    storeName: clip(fill.storeName || '', 100),
    phone: clip(fill.phone || '', 20),
    address: clip(fill.address || '', 500),
    region: clip(fill.region || '', 80),
    buyerType: clip(fill.buyerType || '', 40),
    notes: clip(fill.notes || '', 500),
  };
}

/** Embeds fills in the reply body so View/Fill buttons survive history without relying on API state. */
export function embedProspectFillsInReply(text: string, fills: ProspectFormFill[]): string {
  const visible = text.replace(PROSPECTS_STRIP, '').trim();
  const clean = fills.map(sanitizeFill).filter((row) => row.storeName || row.name).slice(0, 12);
  if (!clean.length) return visible;
  return `${visible}\n\n${PROSPECTS_MARK}${JSON.stringify(clean)}-->`;
}

/** Reads embedded fills, or rebuilds them from the "Newly added" bullet list. */
export function extractProspectFillsFromReply(text: string): {
  text: string;
  prospectFills: ProspectFormFill[];
} {
  const markMatch = text.match(/<!--laku-prospects:([\s\S]*?)-->\s*$/);
  if (markMatch) {
    const visible = text.replace(PROSPECTS_STRIP, '').trim();
    try {
      const parsed = JSON.parse(markMatch[1]) as unknown;
      if (Array.isArray(parsed)) {
        const prospectFills = parsed
          .map((row) => sanitizeFill(row as ProspectFormFill))
          .filter((row) => row.storeName || row.name)
          .slice(0, 12);
        return { text: visible, prospectFills };
      }
    } catch {
      return { text: visible, prospectFills: [] };
    }
    return { text: visible, prospectFills: [] };
  }

  const prospectFills: ProspectFormFill[] = [];
  let inList = false;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === 'Newly added:' || trimmed === 'Baru ditambahkan:') {
      inList = true;
      continue;
    }
    if (!inList) continue;
    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (!bullet) {
      if (!trimmed) continue;
      break;
    }
    const parts = bullet[1].split(/\s+·\s+/).map((part) => part.trim()).filter(Boolean);
    const storeName = parts[0] || '';
    if (!storeName) continue;
    const phonePart = parts.find((part) => /^[+0-9][\d\s()-]{6,}$/.test(part.replace(/\s/g, '')));
    const address = parts.filter((part) => part !== storeName && part !== phonePart).join(' · ');
    prospectFills.push(
      sanitizeFill({
        buyerId: null,
        customerNumber: '',
        name: storeName,
        storeName,
        phone: phonePart || '-',
        address,
        region: '',
        buyerType: '',
        notes: '',
      }),
    );
    if (prospectFills.length >= 12) break;
  }

  return { text: text.replace(PROSPECTS_STRIP, '').trim(), prospectFills };
}

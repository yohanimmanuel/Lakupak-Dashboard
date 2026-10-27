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
const LIST_HEADERS = new Set([
  'newly added:',
  'baru ditambahkan:',
  'suggested:',
  'usulan:',
  'proposals:',
  'results:',
  'hasil:',
]);

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

function looksLikePhone(value: string) {
  const compact = value.replace(/\s/g, '');
  return /^[+0-9][\d()-]{6,}$/.test(compact);
}

/** Short forms like "Jl. A 1" / "St. 5" that would otherwise fail the length cutoff. */
function looksLikeShortStreetAddress(value: string) {
  return (
    /\b(?:jl\.?|jalan|st\.?|street|rd\.?|road|no\.?|rt\.?|rw\.?)\b/i.test(value) && /\d/.test(value)
  );
}

/** Reject percentages, bare numbers, and other non-location second fields. */
function looksLikeAddress(value: string) {
  const text = value.trim();
  if (/^\d+([.,]\d+)?%$/.test(text)) return false;
  if (/^[\d\s.,/+-]+$/.test(text)) return false;
  if (/^(low|medium|high|missing|zero)$/i.test(text)) return false;
  if (!/[A-Za-z\u00C0-\u024F]/.test(text)) return false;
  if (text.length >= 8) return true;
  return looksLikeShortStreetAddress(text);
}

function fillFromBullet(line: string): ProspectFormFill | null {
  const bullet = line.trim().match(/^[-*•]\s+(.+)$/);
  if (!bullet) return null;
  const parts = bullet[1]
    .split(/\s+·\s+|\s+\|\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const storeName = parts[0] || '';
  if (!storeName || storeName.length < 2) return null;
  const phonePart = parts.find((part) => looksLikePhone(part));
  const addressParts = parts.filter((part) => part !== storeName && part !== phonePart);
  const address = addressParts.join(' · ');
  const hasCredibleAddress = addressParts.some((part) => looksLikeAddress(part));
  // Require a phone or a credible address — do not treat "14.3%" / "Low" as location.
  if (!phonePart && !hasCredibleAddress) return null;
  return sanitizeFill({
    buyerId: null,
    customerNumber: '',
    name: storeName,
    storeName,
    phone: phonePart || '-',
    address: hasCredibleAddress ? address : '',
    region: '',
    buyerType: '',
    notes: '',
  });
}

function fillsFromListedBullets(text: string): ProspectFormFill[] {
  const prospectFills: ProspectFormFill[] = [];
  let inList = false;
  let sawHeader = false;

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (inList && prospectFills.length > 0) break;
      continue;
    }

    if (LIST_HEADERS.has(trimmed.toLowerCase())) {
      inList = true;
      sawHeader = true;
      continue;
    }

    const isBullet = /^[-*•]\s+/.test(trimmed);
    const fill = fillFromBullet(trimmed);
    if (fill) {
      // Start collecting once we see store · address style bullets, even without a header.
      inList = true;
      prospectFills.push(fill);
      if (prospectFills.length >= 12) break;
      continue;
    }

    if (isBullet) {
      // Keep scanning: a bullet that failed validation must not drop later valid prospects.
      if (sawHeader || inList) inList = true;
      continue;
    }

    if (inList && (sawHeader || prospectFills.length > 0)) {
      // Stop at the first non-bullet after a list has started.
      break;
    }
  }

  return prospectFills;
}

/** Embeds fills in the reply body so View/Fill buttons survive history without relying on API state. */
export function embedProspectFillsInReply(text: string, fills: ProspectFormFill[]): string {
  const visible = text.replace(PROSPECTS_STRIP, '').trim();
  const clean = fills.map(sanitizeFill).filter((row) => row.storeName || row.name).slice(0, 12);
  if (!clean.length) return visible;
  return `${visible}\n\n${PROSPECTS_MARK}${JSON.stringify(clean)}-->`;
}

/** Reads embedded fills, or rebuilds them from prospect bullet lists. */
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

  const visible = text.replace(PROSPECTS_STRIP, '').trim();
  return { text: visible, prospectFills: fillsFromListedBullets(visible) };
}

export type MatchSignal = 'phone_match' | 'address_match' | 'address_similar' | 'name_similar';

export type SignalLevel = 'high' | 'medium' | 'none';

export type SignalResult = {
  signals: MatchSignal[];
  score: number;
  level: SignalLevel;
};

function normalizeText(value: string | null | undefined): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function digits(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '');
}

/** Same digits, with or without a country code. A shared phone is a unique match. */
export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const da = digits(a);
  const db = digits(b);
  if (da.length < 8 || db.length < 8) return false;
  const sa = da.slice(-10);
  const sb = db.slice(-10);
  return da === db || sa === sb || da.endsWith(sb) || db.endsWith(sa);
}

function tokens(value: string): string[] {
  return normalizeText(value)
    .split(' ')
    .filter((token) => token.length > 2);
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  ta.forEach((token) => {
    if (tb.has(token)) shared += 1;
  });
  return shared / (ta.size + tb.size - shared);
}

function textSimilar(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (na.length < 3 || nb.length < 3) return false;
  if (na === nb) return true;
  if ((na.includes(nb) || nb.includes(na)) && Math.min(na.length, nb.length) >= 4) return true;
  return tokenOverlap(na, nb) >= 0.5;
}

function addressRelation(
  incoming: string | null | undefined,
  existing: string | null | undefined,
): 'exact' | 'near' | 'none' {
  const na = normalizeText(incoming);
  const nb = normalizeText(existing);
  if (na.length < 6 || nb.length < 6) return 'none';
  if (na === nb) return 'exact';
  if (na.includes(nb) || nb.includes(na)) return 'near';
  if (tokenOverlap(na, nb) >= 0.6) return 'near';
  return 'none';
}

export function classifyClientSignals(input: {
  incomingPhone?: string | null;
  incomingAddress?: string | null;
  incomingStoreName?: string | null;
  incomingOwnerName?: string | null;
  existingPhone?: string | null;
  existingAddress?: string | null;
  existingStoreName?: string | null;
  existingOwnerName?: string | null;
}): SignalResult {
  const signals: MatchSignal[] = [];
  let score = 0;

  if (phonesMatch(input.incomingPhone, input.existingPhone)) {
    signals.push('phone_match');
    score += 40;
  }

  const address = addressRelation(input.incomingAddress, input.existingAddress);
  if (address === 'exact') {
    signals.push('address_match');
    score += 40;
  } else if (address === 'near') {
    signals.push('address_similar');
    score += 25;
  }

  const nameHit =
    textSimilar(input.incomingStoreName, input.existingStoreName) ||
    textSimilar(input.incomingStoreName, input.existingOwnerName) ||
    textSimilar(input.incomingOwnerName, input.existingStoreName) ||
    textSimilar(input.incomingOwnerName, input.existingOwnerName);
  if (nameHit) {
    signals.push('name_similar');
    const exact =
      normalizeText(input.incomingStoreName) === normalizeText(input.existingStoreName) &&
      normalizeText(input.incomingStoreName).length >= 3;
    score += exact ? 45 : 30;
  }

  const categories = [
    signals.includes('phone_match'),
    signals.includes('address_match') || signals.includes('address_similar'),
    signals.includes('name_similar'),
  ].filter(Boolean).length;

  const strongIdentity = signals.includes('phone_match') || signals.includes('address_match');
  const level: SignalLevel = categories >= 2 && strongIdentity ? 'high' : categories >= 1 ? 'medium' : 'none';
  return { signals, score: Math.min(100, score), level };
}

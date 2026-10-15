export type MatchSignal =
  | 'phone_match'
  | 'address_match'
  | 'address_similar'
  | 'store_match'
  | 'store_similar'
  | 'owner_match'
  | 'owner_similar'
  | 'name_similar';

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
  if (tokenOverlap(na, nb) >= 0.45) return 'near';
  return 'none';
}

const FIELD_EXACT = 25;
const FIELD_SIMILAR = 15;

function textField(a: string | null | undefined, b: string | null | undefined): 'exact' | 'similar' | 'none' {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (na.length < 3 || nb.length < 3) return 'none';
  if (na === nb) return 'exact';
  return textSimilar(a, b) ? 'similar' : 'none';
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
    score += FIELD_EXACT;
  }

  const store = textField(input.incomingStoreName, input.existingStoreName);
  if (store === 'exact') {
    signals.push('store_match');
    score += FIELD_EXACT;
  } else if (store === 'similar') {
    signals.push('store_similar');
    score += FIELD_SIMILAR;
  }

  const owner = textField(input.incomingOwnerName, input.existingOwnerName);
  if (owner === 'exact') {
    signals.push('owner_match');
    score += FIELD_EXACT;
  } else if (owner === 'similar') {
    signals.push('owner_similar');
    score += FIELD_SIMILAR;
  }

  const address = addressRelation(input.incomingAddress, input.existingAddress);
  if (address === 'exact') {
    signals.push('address_match');
    score += FIELD_EXACT;
  } else if (address === 'near') {
    signals.push('address_similar');
    score += FIELD_SIMILAR;
  }

  const level: SignalLevel = score >= 75 ? 'high' : score >= 50 ? 'medium' : 'none';
  return { signals, score: Math.min(100, score), level };
}

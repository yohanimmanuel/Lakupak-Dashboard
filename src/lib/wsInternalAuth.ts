/** Shared secret for internal WebSocket broadcast HTTP calls (Next.js API → WS server). */

/** Strip line breaks / surrounding whitespace so values remain valid HTTP header tokens. */
export function normalizeWsInternalSecret(raw: string): string {
  return raw.replace(/\s+/g, '').trim();
}

export function getWsInternalSecret(): string {
  const raw = process.env.WS_INTERNAL_SECRET || process.env.JWT_SECRET || '';
  return normalizeWsInternalSecret(raw);
}

export function isValidWsInternalSecret(provided: string | null | undefined): boolean {
  const expected = getWsInternalSecret();
  if (!expected || !provided) return false;
  return normalizeWsInternalSecret(provided) === expected;
}

export const WS_INTERNAL_SECRET_HEADER = 'x-ws-internal-secret';

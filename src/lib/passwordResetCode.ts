import { createHash, createHmac } from 'crypto';

/**
 * Hashing for password-reset verification codes (dashboard + marketplace flows).
 *
 * A reset code is only a 6-digit number, so a bare SHA-256 digest has just 10^6
 * preimages and is trivially reversed by precomputation if the token table leaks.
 * We therefore store a keyed HMAC: without the server-side secret an attacker
 * cannot map a leaked digest back to a code. This mirrors the OTP scheme in
 * `mobileOtp.ts` (same secret precedence and `hmac:` prefix convention).
 */

/** Marks HMAC digests; legacy rows store a bare SHA-256 hex without this prefix. */
const HMAC_PREFIX = 'hmac:';

function getResetCodeHmacSecret(): string {
  const rawSecret =
    process.env.PASSWORD_RESET_HMAC_SECRET ??
    process.env.OTP_HMAC_SECRET ??
    process.env.JWT_SECRET;
  if (!rawSecret) {
    throw new Error('PASSWORD_RESET_HMAC_SECRET, OTP_HMAC_SECRET, or JWT_SECRET is not set');
  }
  const secret = rawSecret.replace(/\s+/g, '').trim();
  if (!secret) {
    throw new Error('PASSWORD_RESET_HMAC_SECRET, OTP_HMAC_SECRET, or JWT_SECRET is empty');
  }
  return secret;
}

/** Keyed HMAC of a reset code — the value that new tokens are stored/looked up under. */
export function hashResetCode(code: string): string {
  const digest = createHmac('sha256', getResetCodeHmacSecret()).update(code).digest('hex');
  return `${HMAC_PREFIX}${digest}`;
}

/** @deprecated Legacy unsalted SHA-256; kept only to match codes issued before HMAC rollout. */
function legacyHashResetCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/**
 * Candidate stored-hash values for a supplied code: the current HMAC plus the legacy
 * unsalted hash. Use with `tokenHash: { in: resetCodeHashCandidates(code) }` so codes
 * issued just before rollout still validate until they expire (≤ 1h), while all new
 * codes are matched by the HMAC.
 */
export function resetCodeHashCandidates(code: string): string[] {
  return [hashResetCode(code), legacyHashResetCode(code)];
}

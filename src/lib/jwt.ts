import jwt, { type SignOptions, type JwtPayload as LibJwtPayload, type Secret } from 'jsonwebtoken'

// Get JWT_SECRET at runtime, not at module load time
// This allows environment variables to be loaded before this module is imported
function getJwtSecret(): Secret {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set');
  }
  // Env files must be single-line; strip accidental line breaks for header-safe use elsewhere too.
  return secret.replace(/\s+/g, '').trim();
}

/** Identifies which account namespace `sub` refers to. */
export type JwtPrincipalType = 'dashboard' | 'marketplace' | 'driver'

export const JWT_ISSUER_DASHBOARD = 'laku-dashboard'
export const JWT_ISSUER_MARKETPLACE = 'laku-marketplace'
export const JWT_AUDIENCE_LAKU = 'laku-api'

export type AppJwtPayload = {
  sub: number
  phone?: string
  /** Omitted on legacy tokens; callers must fall back to a DB existence check. */
  type?: JwtPrincipalType
  /** Distributor storefront opened by the referral code used at sign-in. */
  distributorId?: number
  /** Standard JWT iss claim when present (legacy tokens may omit). */
  iss?: string
  aud?: string | string[]
}

export function signAccessToken(payload: AppJwtPayload, expiresIn: string = '30d'): string {
  const secret = getJwtSecret();
  const { iss: _iss, aud: _aud, ...body } = payload;
  const issuer =
    payload.type === 'dashboard'
      ? JWT_ISSUER_DASHBOARD
      : payload.type === 'marketplace'
        ? JWT_ISSUER_MARKETPLACE
        : undefined;

  return jwt.sign(body as Record<string, unknown>, secret, {
    expiresIn,
    ...(issuer ? { issuer, audience: JWT_AUDIENCE_LAKU } : {}),
  } as SignOptions);
}

export function verifyAccessToken(token: string): AppJwtPayload {
  const secret = getJwtSecret();
  const decoded = jwt.verify(token, secret) as LibJwtPayload | string
  if (typeof decoded === 'string') {
    throw new Error('Invalid token payload')
  }
  const subValue = typeof decoded.sub === 'string' ? Number(decoded.sub) : (decoded.sub as number | undefined)
  if (typeof subValue !== 'number' || Number.isNaN(subValue) || !Number.isInteger(subValue) || subValue <= 0) {
    throw new Error('Invalid token subject')
  }

  const rawType = (decoded as { type?: unknown }).type
  let type: JwtPrincipalType | undefined
  if (rawType === 'dashboard' || rawType === 'marketplace' || rawType === 'driver') {
    type = rawType
  }

  const iss = typeof decoded.iss === 'string' ? decoded.iss : undefined
  const aud = decoded.aud as string | string[] | undefined
  const rawDistributorId = (decoded as { distributorId?: unknown }).distributorId
  const distributorId =
    typeof rawDistributorId === 'number' && Number.isInteger(rawDistributorId) && rawDistributorId > 0
      ? rawDistributorId
      : undefined

  return {
    sub: subValue,
    phone: (decoded as { phone?: string }).phone,
    type,
    distributorId,
    iss,
    aud,
  }
}



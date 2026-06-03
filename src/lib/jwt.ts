import jwt, { type SignOptions, type JwtPayload as LibJwtPayload, type Secret } from 'jsonwebtoken'

// Get JWT_SECRET at runtime, not at module load time
// This allows environment variables to be loaded before this module is imported
function getJwtSecret(): Secret {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set');
  }
  return secret;
}

/** Identifies which account namespace `sub` refers to. */
export type JwtPrincipalType = 'dashboard' | 'marketplace' | 'driver'

export type AppJwtPayload = {
  sub: number
  phone?: string
  /** Omitted on legacy tokens; callers must fall back to a DB existence check. */
  type?: JwtPrincipalType
}

export function signAccessToken(payload: AppJwtPayload, expiresIn: string = '30d'): string {
  const secret = getJwtSecret();
  // jsonwebtoken types for expiresIn accept string or number
  // Pass options directly to avoid type issues with SignOptions
  return jwt.sign(payload as Record<string, unknown>, secret, { expiresIn } as SignOptions)
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

  return { sub: subValue, phone: (decoded as { phone?: string }).phone, type }
}



import jwt, { type SignOptions, type JwtPayload as LibJwtPayload, type Secret } from 'jsonwebtoken'

const JWT_SECRET: Secret = process.env.JWT_SECRET as string

export type AppJwtPayload = {
  sub: number
  phone?: string
}

export function signAccessToken(payload: AppJwtPayload, expiresIn: string = '30d'): string {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not set')
  }
  // jsonwebtoken types for expiresIn can be a special StringValue; cast to satisfy types
  const options: SignOptions = { expiresIn: expiresIn as string | number }
  return jwt.sign(payload as Record<string, unknown>, JWT_SECRET, options)
}

export function verifyAccessToken(token: string): AppJwtPayload {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not set')
  }
  const decoded = jwt.verify(token, JWT_SECRET) as LibJwtPayload | string
  if (typeof decoded === 'string') {
    throw new Error('Invalid token payload')
  }
  const subValue = typeof decoded.sub === 'string' ? Number(decoded.sub) : (decoded.sub as number | undefined)
  if (typeof subValue !== 'number' || Number.isNaN(subValue)) {
    throw new Error('Invalid token subject')
  }
  return { sub: subValue, phone: (decoded as { phone?: string }).phone }
}



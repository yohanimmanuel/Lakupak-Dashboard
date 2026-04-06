import jwt, { type JwtPayload as LibJwtPayload, type Secret, type SignOptions } from 'jsonwebtoken';

function getJwtSecret(): Secret {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return secret;
}

export type PlatformAdminJwtPayload = {
  sub: number; // PlatformAdmin.id
  type: 'platform_admin';
};

export function signPlatformAdminToken(
  payload: Omit<PlatformAdminJwtPayload, 'type'> & { type?: 'platform_admin' },
  expiresIn: string = '30d'
): string {
  const secret = getJwtSecret();
  const normalized: PlatformAdminJwtPayload = {
    sub: payload.sub,
    type: 'platform_admin',
  };
  return jwt.sign(normalized as Record<string, unknown>, secret, { expiresIn } as SignOptions);
}

export function verifyPlatformAdminToken(token: string): PlatformAdminJwtPayload {
  const secret = getJwtSecret();
  const decoded = jwt.verify(token, secret) as LibJwtPayload | string;
  if (typeof decoded === 'string') throw new Error('Invalid token payload');
  const subValue = typeof decoded.sub === 'string' ? Number(decoded.sub) : (decoded.sub as number | undefined);
  if (typeof subValue !== 'number' || Number.isNaN(subValue)) throw new Error('Invalid token subject');
  const typeValue = (decoded as { type?: unknown }).type;
  if (typeValue !== 'platform_admin') throw new Error('Invalid token type');
  return { sub: subValue, type: 'platform_admin' };
}


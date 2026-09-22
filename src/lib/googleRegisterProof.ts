import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/db';

const PROOF_TTL_MS = 2 * 60 * 60 * 1000;

function proofSecret(): string {
  const raw = process.env.AUTH_SECRET?.trim();
  if (!raw) {
    throw new Error('AUTH_SECRET is required to issue Google registration proofs');
  }
  return raw;
}

function hashProofToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function signPayload(payload: string): string {
  return createHmac('sha256', proofSecret()).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function issueGoogleRegisterProof(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const nonce = randomBytes(16).toString('hex');
  const exp = Date.now() + PROOF_TTL_MS;
  const payload = Buffer.from(JSON.stringify({ email: normalized, exp, nonce })).toString('base64url');
  const token = `${payload}.${signPayload(payload)}`;
  const expiresAt = new Date(exp);

  await prisma.googleRegisterProof.deleteMany({
    where: {
      OR: [{ email: normalized, consumedAt: null }, { expiresAt: { lt: new Date() } }],
    },
  });
  await prisma.googleRegisterProof.create({
    data: {
      email: normalized,
      tokenHash: hashProofToken(token),
      expiresAt,
    },
  });
  return token;
}

export function googleRegisterProofMatchesEmail(token: string, email: string): boolean {
  const trimmed = token.trim();
  const dot = trimmed.lastIndexOf('.');
  if (dot <= 0 || dot === trimmed.length - 1) return false;
  const payload = trimmed.slice(0, dot);
  const sig = trimmed.slice(dot + 1);
  if (!safeEqual(sig, signPayload(payload))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      email?: unknown;
      exp?: unknown;
    };
    if (typeof data.email !== 'string' || typeof data.exp !== 'number') return false;
    if (data.exp < Date.now()) return false;
    return data.email === email.trim().toLowerCase();
  } catch {
    return false;
  }
}

type ProofDb = Pick<typeof prisma, 'googleRegisterProof'>;

export async function consumeGoogleRegisterProof(
  db: ProofDb,
  token: string,
  email: string,
): Promise<boolean> {
  const trimmed = typeof token === 'string' ? token.trim() : '';
  if (!trimmed || !googleRegisterProofMatchesEmail(trimmed, email)) return false;
  const normalized = email.trim().toLowerCase();
  const row = await db.googleRegisterProof.findFirst({
    where: {
      tokenHash: hashProofToken(trimmed),
      email: normalized,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  if (!row) return false;
  const result = await db.googleRegisterProof.updateMany({
    where: {
      id: row.id,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { consumedAt: new Date() },
  });
  return result.count === 1;
}

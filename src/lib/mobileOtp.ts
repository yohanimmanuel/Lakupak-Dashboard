import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/db';

const OTP_EXPIRY_MINUTES = 10;
const MAX_VERIFY_ATTEMPTS = 5;
/** Prefix for HMAC digests; legacy rows store bare SHA-256 hex without this prefix. */
const HMAC_PREFIX = 'hmac:';

export type VerifyMobileOtpResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'expired' | 'invalid' | 'too_many_attempts' };

function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.startsWith('+')) return trimmed;
  const digits = trimmed.replace(/\D/g, '');
  return digits ? `+${digits}` : trimmed;
}

function getOtpHmacSecret(): string {
  const secret = process.env.OTP_HMAC_SECRET ?? process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('OTP_HMAC_SECRET or JWT_SECRET is not set');
  }
  return secret.replace(/\s+/g, '').trim();
}

function hashOtp(code: string): string {
  const digest = createHmac('sha256', getOtpHmacSecret()).update(code).digest('hex');
  return `${HMAC_PREFIX}${digest}`;
}

/** @deprecated Legacy unsalted SHA-256; kept only to verify OTPs stored before HMAC rollout. */
function legacyHashOtp(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function digestEqual(provided: string, stored: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(stored, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function codesMatch(provided: string, storedHash: string): boolean {
  if (storedHash.startsWith(HMAC_PREFIX)) {
    return digestEqual(hashOtp(provided), storedHash);
  }
  return digestEqual(legacyHashOtp(provided), storedHash);
}

function activeOtpWhere(recordId: number, now = new Date()) {
  return {
    id: recordId,
    consumedAt: null,
    attempts: { lt: MAX_VERIFY_ATTEMPTS },
    expiresAt: { gt: now },
  } as const;
}

async function classifyMissingActiveOtp(phone: string): Promise<VerifyMobileOtpResult> {
  const latest = await prisma.otpCode.findFirst({
    where: { phone },
    orderBy: { createdAt: 'desc' },
  });
  if (!latest || latest.consumedAt) {
    return { ok: false, reason: 'not_found' };
  }
  if (latest.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: 'expired' };
  }
  if (latest.attempts >= MAX_VERIFY_ATTEMPTS) {
    return { ok: false, reason: 'too_many_attempts' };
  }
  return { ok: false, reason: 'not_found' };
}

async function failureAfterConditionalMiss(recordId: number): Promise<VerifyMobileOtpResult> {
  const current = await prisma.otpCode.findUnique({ where: { id: recordId } });
  if (!current || current.consumedAt) {
    return { ok: false, reason: 'invalid' };
  }
  if (current.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: 'expired' };
  }
  if (current.attempts >= MAX_VERIFY_ATTEMPTS) {
    return { ok: false, reason: 'too_many_attempts' };
  }
  return { ok: false, reason: 'invalid' };
}

export async function storeMobileOtp(params: {
  phone: string;
  countryCode?: string | null;
  channel: string;
  code: string;
  ipAddress?: string | null;
}): Promise<void> {
  const phone = normalizePhone(params.phone);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await prisma.otpCode.deleteMany({
    where: { phone, consumedAt: null },
  });

  await prisma.otpCode.create({
    data: {
      phone,
      countryCode: params.countryCode ?? null,
      channel: params.channel,
      code: hashOtp(params.code),
      expiresAt,
      ipAddress: params.ipAddress ?? null,
    },
  });
}

export async function verifyMobileOtp(phone: string, code: string): Promise<VerifyMobileOtpResult> {
  const normalizedPhone = normalizePhone(phone);
  const now = new Date();

  const record = await prisma.otpCode.findFirst({
    where: {
      phone: normalizedPhone,
      consumedAt: null,
      attempts: { lt: MAX_VERIFY_ATTEMPTS },
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!record) {
    return classifyMissingActiveOtp(normalizedPhone);
  }

  const whereActive = activeOtpWhere(record.id, now);

  if (!codesMatch(code, record.code)) {
    const updated = await prisma.otpCode.updateMany({
      where: whereActive,
      data: { attempts: { increment: 1 } },
    });
    if (updated.count === 0) {
      return failureAfterConditionalMiss(record.id);
    }
    return { ok: false, reason: 'invalid' };
  }

  const consumed = await prisma.otpCode.updateMany({
    where: whereActive,
    data: { consumedAt: now },
  });
  if (consumed.count === 0) {
    return failureAfterConditionalMiss(record.id);
  }

  return { ok: true };
}

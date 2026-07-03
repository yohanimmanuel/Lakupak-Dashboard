import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { resetDb } from './helpers';
import { storeMobileOtp, verifyMobileOtp } from '@/lib/mobileOtp';

describe('mobile OTP HMAC storage', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('stores HMAC digest and verifies the correct code', async () => {
    await storeMobileOtp({
      phone: '+620000000123',
      channel: 'sms',
      code: '123456',
    });

    const row = await prisma.otpCode.findFirst({
      where: { phone: '+620000000123' },
      select: { code: true },
    });

    expect(row?.code).toMatch(/^hmac:[a-f0-9]{64}$/);
    expect(row?.code).not.toBe('123456');

    const result = await verifyMobileOtp('+620000000123', '123456');
    expect(result).toEqual({ ok: true });
  });

  it('rejects an incorrect code', async () => {
    await storeMobileOtp({
      phone: '+620000000124',
      channel: 'sms',
      code: '654321',
    });

    const result = await verifyMobileOtp('+620000000124', '000000');
    expect(result).toEqual({ ok: false, reason: 'invalid' });
  });

  it('allows only one successful verify under concurrent correct-code requests', async () => {
    await storeMobileOtp({
      phone: '+620000000125',
      channel: 'sms',
      code: '111111',
    });

    const results = await Promise.all(
      Array.from({ length: 5 }, () => verifyMobileOtp('+620000000125', '111111')),
    );

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toHaveLength(4);

    const row = await prisma.otpCode.findFirst({
      where: { phone: '+620000000125' },
      select: { consumedAt: true, attempts: true },
    });
    expect(row?.consumedAt).not.toBeNull();
    expect(row?.attempts).toBe(0);
  });

  it('does not exceed MAX_VERIFY_ATTEMPTS under concurrent wrong-code requests', async () => {
    await storeMobileOtp({
      phone: '+620000000126',
      channel: 'sms',
      code: '222222',
    });

    await Promise.all(
      Array.from({ length: 10 }, () => verifyMobileOtp('+620000000126', '999999')),
    );

    const row = await prisma.otpCode.findFirst({
      where: { phone: '+620000000126' },
      select: { attempts: true, consumedAt: true },
    });
    expect(row?.attempts).toBeLessThanOrEqual(5);
    expect(row?.consumedAt).toBeNull();
  });
});

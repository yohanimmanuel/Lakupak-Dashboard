import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { POST } from '@/app/api/mobile/auth/verify-otp/route';
import { ensureIntegrationAuthEnv, resetDb } from './helpers';

function makeVerifyOtpRequest(body: unknown, ip = '127.0.0.1.20') {
  const req = new Request('http://localhost/api/mobile/auth/verify-otp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip,
    },
    body: JSON.stringify(body),
  });
  return new NextRequest(req);
}

const dummySignupBody = {
  phone: '+0000000000',
  countryCode: 'ID',
  code: '123456',
  mode: 'signup' as const,
  profile: {
    name: 'Dummy Phone User',
    email: 'dummy-phone@example.com',
    username: 'dummy_phone_user',
    password: 'secret12',
  },
};

describe('POST /api/mobile/auth/verify-otp dummy phone bypass', () => {
  beforeEach(async () => {
    ensureIntegrationAuthEnv();
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('MOBILE_OTP_ALLOW_DUMMY_PHONES', '1');
    await resetDb();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('allows signup with dummy phone without a stored OTP when bypass flag is enabled', async () => {
    const response = await POST(makeVerifyOtpRequest(dummySignupBody));

    const body = (await response.json()) as { token?: string; error?: string };

    expect(response.status).toBe(201);
    expect(body.token).toBeTruthy();
    expect(body.error).toBeUndefined();

    const user = await prisma.marketplaceUser.findUnique({
      where: { email: 'dummy-phone@example.com' },
    });
    expect(user).not.toBeNull();
    expect(user?.phone).toBeNull();
  });

  it('requires normal OTP verification for dummy phone when bypass flag is off', async () => {
    vi.stubEnv('MOBILE_OTP_ALLOW_DUMMY_PHONES', '0');

    const response = await POST(makeVerifyOtpRequest(dummySignupBody));
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/verification code/i);

    const user = await prisma.marketplaceUser.findUnique({
      where: { email: 'dummy-phone@example.com' },
    });
    expect(user).toBeNull();
  });

  it('never allows dummy phone bypass in production even when flag is set', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('MOBILE_OTP_ALLOW_DUMMY_PHONES', '1');

    const response = await POST(makeVerifyOtpRequest(dummySignupBody));
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/verification code/i);
  });
});

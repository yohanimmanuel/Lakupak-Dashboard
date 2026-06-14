import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { POST } from '@/app/api/mobile/auth/register/route';
import { ensureIntegrationAuthEnv, resetDb } from './helpers';

function makeRegisterRequest(body: unknown, ip = '127.0.0.1.10') {
  const req = new Request('http://localhost/api/mobile/auth/register', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip,
    },
    body: JSON.stringify(body),
  });
  return new NextRequest(req);
}

const validPayload = {
  name: 'Integration Test User',
  email: 'integration-register@example.com',
  username: 'integration_register',
  password: 'secret12',
  phone: '81234567890',
  countryCode: 'ID',
  countryDialCode: '+62',
  address: 'Jl. Integration Test 123, Jakarta',
  addressFullName: 'Integration Test User',
  addressLabel: 'home',
  addressIsDefault: true,
};

describe('POST /api/mobile/auth/register', () => {
  beforeEach(async () => {
    ensureIntegrationAuthEnv();
    await resetDb();
  });

  it('creates a marketplace user with a default address', async () => {
    const response = await POST(makeRegisterRequest(validPayload));
    const body = (await response.json()) as {
      token?: string;
      user?: { id: number; email: string };
      error?: string;
    };

    expect(response.status).toBe(201);
    expect(body.token).toBeTruthy();
    expect(body.user?.email).toBe(validPayload.email);

    const user = await prisma.marketplaceUser.findUnique({
      where: { email: validPayload.email.toLowerCase() },
      include: { addresses: true },
    });

    expect(user).not.toBeNull();
    expect(user?.phone).toMatch(/^\+62/);
    expect(user?.addresses).toHaveLength(1);
    expect(user?.addresses[0]?.isDefault).toBe(true);
    expect(user?.addresses[0]?.address).toBe(validPayload.address);
  });

  it('returns 400 when phone is missing', async () => {
    const { phone: _phone, ...withoutPhone } = validPayload;
    const response = await POST(makeRegisterRequest(withoutPhone));
    const body = (await response.json()) as { code?: string };

    expect(response.status).toBe(400);
    expect(body.code).toBe('PHONE_REQUIRED');
  });

  it('returns 409 when email is already registered', async () => {
    await POST(makeRegisterRequest(validPayload));
    const response = await POST(
      makeRegisterRequest(
        {
          ...validPayload,
          username: 'integration_register_2',
          phone: '81234567891',
        },
        '127.0.0.1.11',
      ),
    );
    const body = (await response.json()) as { code?: string };

    expect(response.status).toBe(409);
    expect(body.code).toBe('EMAIL_ALREADY_REGISTERED');
  });
});

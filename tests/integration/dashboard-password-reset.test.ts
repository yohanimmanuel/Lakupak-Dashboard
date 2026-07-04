import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { createHash } from 'crypto';
import { compare, hash } from 'bcryptjs';
import { prisma } from '@/lib/db';
import { POST as forgotPost } from '@/app/api/auth/forgot-password/route';
import { POST as resetPost } from '@/app/api/auth/reset-password/route';
import { POST as verifyPost } from '@/app/api/auth/verify-reset-code/route';
import { ensureIntegrationAuthEnv, resetDb } from './helpers';

function makeReq(url: string, body: unknown, ip: string) {
  const req = new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip,
    },
    body: JSON.stringify(body),
  });
  return new NextRequest(req);
}

const FORGOT_URL = 'http://localhost/api/auth/forgot-password';
const RESET_URL = 'http://localhost/api/auth/reset-password';
const VERIFY_URL = 'http://localhost/api/auth/verify-reset-code';

const OLD_PASSWORD = 'OldPass1!';
const NEW_PASSWORD = 'NewPass1!';

async function createDashboardUser(email: string, password = OLD_PASSWORD) {
  const passwordHash = await hash(password, 10);
  // Store the normalized (lowercased) email, matching how registration persists it,
  // so the endpoints' case-insensitive lookup resolves the user.
  return prisma.user.create({
    data: { email: email.trim().toLowerCase(), password: passwordHash },
    select: { id: true, email: true },
  });
}

async function insertResetCode(userId: number, code: string, expiresAt: Date) {
  const tokenHash = createHash('sha256').update(code).digest('hex');
  return prisma.passwordResetToken.create({
    data: { userId, tokenHash, expiresAt },
  });
}

async function passwordMatches(userId: number, plain: string): Promise<boolean> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { password: true } });
  if (!row?.password) return false;
  return compare(plain, row.password);
}

const oneHourFromNow = () => new Date(Date.now() + 60 * 60 * 1000);

describe('dashboard password reset (integration)', () => {
  beforeEach(async () => {
    ensureIntegrationAuthEnv();
    await resetDb();
  });

  it('rejects a reset with no verification code and leaves the password unchanged (takeover regression)', async () => {
    const user = await createDashboardUser('noToken@example.com');

    const res = await resetPost(
      makeReq(RESET_URL, { email: user.email, password: NEW_PASSWORD }, '10.0.0.1'),
    );
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/verification code/i);
    // The old password must still be the one on file — no silent takeover.
    expect(await passwordMatches(user.id, OLD_PASSWORD)).toBe(true);
    expect(await passwordMatches(user.id, NEW_PASSWORD)).toBe(false);
  });

  it('rejects a reset for an unknown email generically', async () => {
    const res = await resetPost(
      makeReq(
        RESET_URL,
        { email: 'ghost@example.com', token: '123456', password: NEW_PASSWORD },
        '10.0.0.2',
      ),
    );
    const body = (await res.json()) as { error?: string; code?: string };

    expect(res.status).toBe(400);
    expect(body.code).toBe('INVALID_OR_EXPIRED_CODE');
  });

  it('rejects an invalid verification code without consuming the real one', async () => {
    const user = await createDashboardUser('wrongCode@example.com');
    await insertResetCode(user.id, '111111', oneHourFromNow());

    const res = await resetPost(
      makeReq(
        RESET_URL,
        { email: user.email, token: '999999', password: NEW_PASSWORD },
        '10.0.0.3',
      ),
    );

    expect(res.status).toBe(400);
    expect(await passwordMatches(user.id, OLD_PASSWORD)).toBe(true);
    // The legitimate code should still be usable.
    const remaining = await prisma.passwordResetToken.count({ where: { userId: user.id } });
    expect(remaining).toBe(1);
  });

  it('rejects an expired verification code', async () => {
    const user = await createDashboardUser('expired@example.com');
    await insertResetCode(user.id, '222222', new Date(Date.now() - 60 * 1000));

    const res = await resetPost(
      makeReq(
        RESET_URL,
        { email: user.email, token: '222222', password: NEW_PASSWORD },
        '10.0.0.4',
      ),
    );

    expect(res.status).toBe(400);
    expect(await passwordMatches(user.id, OLD_PASSWORD)).toBe(true);
  });

  it('accepts a valid code, updates the password, and makes the code single-use', async () => {
    const user = await createDashboardUser('valid@example.com');
    await insertResetCode(user.id, '333333', oneHourFromNow());

    const res = await resetPost(
      makeReq(
        RESET_URL,
        { email: user.email, token: '333333', password: NEW_PASSWORD },
        '10.0.0.5',
      ),
    );
    expect(res.status).toBe(200);
    expect(await passwordMatches(user.id, NEW_PASSWORD)).toBe(true);

    // Token consumed → not replayable.
    const remaining = await prisma.passwordResetToken.count({ where: { userId: user.id } });
    expect(remaining).toBe(0);

    const replay = await resetPost(
      makeReq(
        RESET_URL,
        { email: user.email, token: '333333', password: 'ThirdPass1!' },
        '10.0.0.5',
      ),
    );
    expect(replay.status).toBe(400);
    // Password from the successful reset must remain, not the replay attempt's.
    expect(await passwordMatches(user.id, NEW_PASSWORD)).toBe(true);
    expect(await passwordMatches(user.id, 'ThirdPass1!')).toBe(false);
  });

  it('forgot-password issues exactly one active code for a real user and stays generic for unknown emails', async () => {
    const user = await createDashboardUser('forgot@example.com');

    const first = await forgotPost(makeReq(FORGOT_URL, { email: user.email }, '10.0.0.6'));
    expect(first.status).toBe(200);
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(1);

    // Re-requesting replaces the previous code rather than stacking codes.
    const second = await forgotPost(makeReq(FORGOT_URL, { email: user.email }, '10.0.0.6'));
    expect(second.status).toBe(200);
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(1);

    // Unknown email: identical generic response, no token rows created anywhere.
    const unknown = await forgotPost(
      makeReq(FORGOT_URL, { email: 'unknown@example.com' }, '10.0.0.7'),
    );
    expect(unknown.status).toBe(200);
    expect(await prisma.passwordResetToken.count()).toBe(1);
  });
});

describe('dashboard reset code verification (integration)', () => {
  beforeEach(async () => {
    ensureIntegrationAuthEnv();
    await resetDb();
  });

  it('accepts a valid code without consuming it (still usable to reset afterwards)', async () => {
    const user = await createDashboardUser('verifyOk@example.com');
    await insertResetCode(user.id, '444444', oneHourFromNow());

    const res = await verifyPost(
      makeReq(VERIFY_URL, { email: user.email, token: '444444' }, '10.0.1.1'),
    );
    const body = (await res.json()) as { valid?: boolean };
    expect(res.status).toBe(200);
    expect(body.valid).toBe(true);
    // Verification must NOT consume the code.
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(1);

    // The same code still completes an actual reset in the final step.
    const reset = await resetPost(
      makeReq(RESET_URL, { email: user.email, token: '444444', password: NEW_PASSWORD }, '10.0.1.1'),
    );
    expect(reset.status).toBe(200);
    expect(await passwordMatches(user.id, NEW_PASSWORD)).toBe(true);
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(0);
  });

  it('rejects an invalid code without consuming the real one', async () => {
    const user = await createDashboardUser('verifyBad@example.com');
    await insertResetCode(user.id, '555555', oneHourFromNow());

    const res = await verifyPost(
      makeReq(VERIFY_URL, { email: user.email, token: '000000' }, '10.0.1.2'),
    );
    expect(res.status).toBe(400);
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(1);
  });

  it('rejects an expired code', async () => {
    const user = await createDashboardUser('verifyExpired@example.com');
    await insertResetCode(user.id, '666666', new Date(Date.now() - 60 * 1000));

    const res = await verifyPost(
      makeReq(VERIFY_URL, { email: user.email, token: '666666' }, '10.0.1.3'),
    );
    expect(res.status).toBe(400);
  });

  it('rejects an unknown email generically', async () => {
    const res = await verifyPost(
      makeReq(VERIFY_URL, { email: 'nobody@example.com', token: '123456' }, '10.0.1.4'),
    );
    const body = (await res.json()) as { code?: string };
    expect(res.status).toBe(400);
    expect(body.code).toBe('INVALID_OR_EXPIRED_CODE');
  });
});

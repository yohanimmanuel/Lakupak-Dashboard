import { describe, beforeEach, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { resetDb } from './helpers';
import {
  inferJwtPrincipalNamespace,
  resolveGraphQLUserFromAccessToken,
} from '@/app/api/graphql/modules/common/auth';
import { signAccessToken, verifyAccessToken } from '@/lib/jwt';

describe('GraphQL legacy JWT namespace (integration)', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('infers namespace only from explicit type or iss', () => {
    expect(inferJwtPrincipalNamespace({ sub: 1, type: 'dashboard' })).toBe('dashboard');
    expect(inferJwtPrincipalNamespace({ sub: 1, type: 'marketplace' })).toBe('marketplace');
    expect(inferJwtPrincipalNamespace({ sub: 1, type: 'driver' })).toBeNull();
    expect(inferJwtPrincipalNamespace({ sub: 1, iss: 'laku-marketplace' })).toBe('marketplace');
    expect(inferJwtPrincipalNamespace({ sub: 1, iss: 'laku-dashboard' })).toBe('dashboard');
    expect(inferJwtPrincipalNamespace({ sub: 1, phone: '+620000000001' })).toBeNull();
    expect(inferJwtPrincipalNamespace({ sub: 1 })).toBeNull();
  });

  it('resolves legacy marketplace token by phone even when dashboard User shares the same id', async () => {
    const sharedId = 999_001;

    const dashboardUser = await prisma.user.create({
      data: { id: sharedId, email: 'shared-id-dashboard@example.com', password: 'x' },
      select: { id: true },
    });

    const marketplaceUser = await prisma.marketplaceUser.create({
      data: { id: sharedId, username: 'shared-id-mp', phone: '+620000000099' },
      select: { id: true },
    });

    expect(dashboardUser.id).toBe(sharedId);
    expect(marketplaceUser.id).toBe(sharedId);

    const user = await resolveGraphQLUserFromAccessToken({
      sub: sharedId,
      phone: '+620000000099',
    });

    expect(user).toEqual({ id: sharedId, type: 'marketplace', distributorId: null });
  });

  it('resolves sub-only legacy token as dashboard', async () => {
    const dashboardUser = await prisma.user.create({
      data: { email: 'legacy-dashboard@example.com', password: 'x' },
      select: { id: true },
    });

    const user = await resolveGraphQLUserFromAccessToken({ sub: dashboardUser.id });
    expect(user).toEqual({ id: dashboardUser.id, type: 'dashboard' });
  });

  it('resolves phone-less legacy marketplace token via DB lookup', async () => {
    const marketplaceUser = await prisma.marketplaceUser.create({
      data: { username: 'legacy-no-phone', email: 'legacy-no-phone@example.com' },
      select: { id: true },
    });

    const user = await resolveGraphQLUserFromAccessToken({ sub: marketplaceUser.id });
    expect(user).toEqual({ id: marketplaceUser.id, type: 'marketplace', distributorId: null });
  });

  it('returns null for ambiguous shared id without phone', async () => {
    const sharedId = 999_002;

    await prisma.user.create({
      data: { id: sharedId, email: 'ambiguous-dashboard@example.com', password: 'x' },
    });
    await prisma.marketplaceUser.create({
      data: { id: sharedId, username: 'ambiguous-mp', email: 'ambiguous-mp@example.com' },
    });

    const user = await resolveGraphQLUserFromAccessToken({ sub: sharedId });
    expect(user).toBeNull();
  });

  it('returns null for shared id when token phone does not match marketplace user', async () => {
    const sharedId = 999_003;

    await prisma.user.create({
      data: { id: sharedId, email: 'collision-dashboard@example.com', password: 'x' },
    });
    await prisma.marketplaceUser.create({
      data: { id: sharedId, username: 'collision-mp', phone: '+620000000099' },
    });

    const user = await resolveGraphQLUserFromAccessToken({
      sub: sharedId,
      phone: '+620000000001',
    });
    expect(user).toBeNull();
  });

  it('disambiguates shared id before enforcing marketplace suspension', async () => {
    const sharedId = 999_004;
    const phone = '+620000000099';

    await prisma.user.create({
      data: { id: sharedId, email: 'suspended-collision-dashboard@example.com', password: 'x' },
    });
    await prisma.marketplaceUser.create({
      data: {
        id: sharedId,
        username: 'suspended-collision-mp',
        phone,
        isSuspended: true,
        suspensionReason: 'policy',
      },
    });

    await expect(
      resolveGraphQLUserFromAccessToken({ sub: sharedId, phone }),
    ).rejects.toMatchObject({
      extensions: { code: 'ACCOUNT_SUSPENDED', reason: 'policy' },
    });
  });

  it('embeds iss on newly signed typed tokens', () => {
    const token = signAccessToken({ sub: 42, type: 'marketplace', phone: '+620000000001' });
    const payload = verifyAccessToken(token);
    expect(payload.type).toBe('marketplace');
    expect(payload.iss).toBe('laku-marketplace');
  });
});

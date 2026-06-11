import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { signAccessToken } from '@/lib/jwt';

/** JWT + auth secrets for handlers that call `getAuthenticatedUserId` / `verifyAccessToken`. */
export function ensureIntegrationAuthEnv(): void {
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'vitest-integration-jwt-secret-min-16-chars';
  }
  if (!process.env.AUTH_SECRET) {
    process.env.AUTH_SECRET = 'vitest-integration-auth-secret-min-16-chars';
  }
}

export function makeAuthenticatedDashboardPutRequest(
  url: string,
  body: unknown,
  dashboardUserId: number,
): NextRequest {
  ensureIntegrationAuthEnv();
  const token = signAccessToken({ sub: dashboardUserId, type: 'dashboard' });
  const req = new Request(url, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      'x-forwarded-for': '127.0.0.1',
    },
    body: JSON.stringify(body),
  });
  return new NextRequest(req);
}

export async function resetDb() {
  // Order matters because of FKs.
  await prisma.userActivity.deleteMany();
  await prisma.searchHistory.deleteMany();
  await prisma.address.deleteMany();
  await prisma.marketplaceSearchQueryLog.deleteMany();
  await prisma.marketplaceSearchTermMap.deleteMany();
  await prisma.platformAdmin.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.variantOption.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.marketplaceUser.deleteMany();
  await prisma.user.deleteMany();
}


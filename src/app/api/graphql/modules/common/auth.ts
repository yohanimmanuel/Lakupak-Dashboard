import { GraphQLError } from 'graphql';
import { prisma } from '@/lib/db';
import {
  JWT_ISSUER_DASHBOARD,
  JWT_ISSUER_MARKETPLACE,
  type AppJwtPayload,
} from '@/lib/jwt';
import { normalizeMarketplacePhone } from '@/utils/marketplacePhone';

export type GraphQLPrincipalType = 'dashboard' | 'marketplace';

export type GraphQLAuthContext = {
  user: { id: number; type: GraphQLPrincipalType } | null;
};

export function getContextUser(ctx: unknown): GraphQLAuthContext['user'] {
  const user = (ctx as GraphQLAuthContext | null | undefined)?.user;
  if (!user || typeof user.id !== 'number' || user.id <= 0) return null;
  return user;
}

export function requireDashboardUser(ctx: unknown, argsUserId?: number): number {
  const user = getContextUser(ctx);
  if (!user || user.type !== 'dashboard') {
    throw new GraphQLError('Authentication required', {
      extensions: { code: 'UNAUTHENTICATED' },
    });
  }
  if (argsUserId != null && argsUserId !== user.id) {
    throw new GraphQLError('Forbidden', { extensions: { code: 'FORBIDDEN' } });
  }
  return user.id;
}

export function requireMarketplaceUser(ctx: unknown, argsUserId: number): number {
  const user = getContextUser(ctx);
  if (!user || user.type !== 'marketplace') {
    throw new GraphQLError('Authentication required', {
      extensions: { code: 'UNAUTHENTICATED' },
    });
  }
  if (argsUserId !== user.id) {
    throw new GraphQLError('Forbidden', { extensions: { code: 'FORBIDDEN' } });
  }
  return user.id;
}

/** Wrap a dashboard resolver that scopes data by `args.userId`. */
export function withDashboardAuth<TArgs extends { userId: number }, TResult>(
  fn: (args: TArgs) => TResult | Promise<TResult>,
) {
  return (_: unknown, args: TArgs, ctx: unknown): TResult | Promise<TResult> => {
    requireDashboardUser(ctx, args.userId);
    return fn(args);
  };
}

/** Wrap a marketplace resolver that scopes data by `args.userId`. */
export function withMarketplaceAuth<TArgs extends { userId: number }, TResult>(
  fn: (args: TArgs) => TResult | Promise<TResult>,
) {
  return (_: unknown, args: TArgs, ctx: unknown): TResult | Promise<TResult> => {
    requireMarketplaceUser(ctx, args.userId);
    return fn(args);
  };
}

export async function resolveDashboardGraphQLUser(userId: number): Promise<number | null> {
  if (!Number.isInteger(userId) || userId <= 0) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isSuspended: true },
  });
  if (!user || user.isSuspended) return null;
  return user.id;
}

export async function resolveMarketplaceGraphQLUser(userId: number): Promise<number | null> {
  if (!Number.isInteger(userId) || userId <= 0) return null;
  const user = await prisma.marketplaceUser.findUnique({
    where: { id: userId },
    select: { id: true, isSuspended: true, suspensionReason: true },
  });
  if (!user) return null;
  if (user.isSuspended) {
    throw new GraphQLError('ACCOUNT_SUSPENDED', {
      extensions: { code: 'ACCOUNT_SUSPENDED', reason: user.suspensionReason ?? null },
    });
  }
  return user.id;
}

/**
 * Infer principal namespace when the token carries an explicit discriminator (`type` or `iss`).
 * Typeless legacy tokens return null and must be resolved via DB lookup.
 */
export function inferJwtPrincipalNamespace(payload: AppJwtPayload): GraphQLPrincipalType | null {
  if (payload.type === 'dashboard' || payload.type === 'marketplace') {
    return payload.type;
  }
  if (payload.type === 'driver') {
    return null;
  }

  if (payload.iss === JWT_ISSUER_DASHBOARD) return 'dashboard';
  if (payload.iss === JWT_ISSUER_MARKETPLACE) return 'marketplace';

  return null;
}

/**
 * Resolve namespace for typeless legacy JWTs via DB existence checks.
 * When both tables share the same id, `phone` is the historical mobile discriminator;
 * otherwise prefer the sole match (supports phone-less legacy marketplace tokens).
 */
async function resolveLegacyJwtPrincipalNamespace(
  payload: AppJwtPayload,
): Promise<GraphQLPrincipalType | null> {
  const dashboardId = await resolveDashboardGraphQLUser(payload.sub);
  let marketplaceId: number | null = null;
  marketplaceId = await resolveMarketplaceGraphQLUser(payload.sub);

  if (dashboardId && marketplaceId) {
    if (!payload.phone?.trim()) return null;
    const marketplaceUser = await prisma.marketplaceUser.findUnique({
      where: { id: payload.sub },
      select: { phone: true },
    });
    const storedPhone = marketplaceUser?.phone?.trim();
    if (!storedPhone) return null;
    const tokenPhone =
      normalizeMarketplacePhone(payload.phone) ?? payload.phone.trim();
    const normalizedStored =
      normalizeMarketplacePhone(storedPhone) ?? storedPhone;
    return tokenPhone === normalizedStored ? 'marketplace' : null;
  }
  if (marketplaceId) return 'marketplace';
  if (dashboardId) return 'dashboard';
  return null;
}

/** Map a verified JWT payload to GraphQL auth context using namespace-aware resolution. */
export async function resolveGraphQLUserFromAccessToken(
  payload: AppJwtPayload,
): Promise<GraphQLAuthContext['user']> {
  if (payload.type === 'driver') return null;

  let namespace = inferJwtPrincipalNamespace(payload);
  if (!namespace && !payload.type && !payload.iss) {
    namespace = await resolveLegacyJwtPrincipalNamespace(payload);
  }
  if (!namespace) return null;

  if (namespace === 'dashboard') {
    const id = await resolveDashboardGraphQLUser(payload.sub);
    return id ? { id, type: 'dashboard' } : null;
  }

  const id = await resolveMarketplaceGraphQLUser(payload.sub);
  return id ? { id, type: 'marketplace' } : null;
}

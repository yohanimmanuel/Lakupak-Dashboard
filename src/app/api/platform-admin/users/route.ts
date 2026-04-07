import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { requirePlatformAdminId } from '@/utils/platform-admin-auth';

export type PlatformUserSource = 'dashboard' | 'marketplace' | 'driver';

export type PlatformUserRow = {
  source: PlatformUserSource;
  dbId: number;
  name: string;
  subtitle: string | null;
  email: string | null;
  phone: string | null;
  roleLabel: string;
  status: string | null;
  avatar: string | null;
  createdAt: string;
};

function buildContains(search: string) {
  return { contains: search, mode: 'insensitive' as const };
}

export async function GET(req: NextRequest) {
  const headers = getSecurityHeaders();
  try {
    requirePlatformAdminId(req);
    const { searchParams } = new URL(req.url);
    const allowedSources = new Set(['all', 'dashboard', 'marketplace', 'driver'] as const);
    const rawSource = (searchParams.get('source') ?? 'all').toLowerCase();
    if (!allowedSources.has(rawSource as any)) {
      return NextResponse.json({ error: 'Invalid source' }, { status: 400, headers });
    }
    const source = rawSource as 'all' | 'dashboard' | 'marketplace' | 'driver';
    const search = (searchParams.get('search') ?? '').trim();
    const take = Math.min(Math.max(Number(searchParams.get('limit') ?? '500') || 500, 1), 2000);

    const q = search.length > 0 ? search : null;

    const rows: PlatformUserRow[] = [];

    const loadDashboard = async () => {
      const where = q
        ? {
            OR: [
              { email: buildContains(q) },
              { name: buildContains(q) },
              { firstName: buildContains(q) },
              { lastName: buildContains(q) },
              { phone: buildContains(q) },
            ],
          }
        : undefined;

      const users = await prisma.user.findMany({
        where,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          name: true,
          email: true,
          phone: true,
          image: true,
          avatar: true,
          createdAt: true,
        },
      });

      for (const u of users) {
        const full = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
        const name = (u.name?.trim() || full || u.email || `User #${u.id}`).trim();
        rows.push({
          source: 'dashboard',
          dbId: u.id,
          name,
          subtitle: null,
          email: u.email,
          phone: u.phone ?? null,
          roleLabel: 'Distributor',
          status: null,
          avatar: u.avatar ?? u.image ?? null,
          createdAt: u.createdAt.toISOString(),
        });
      }
    };

    const loadMarketplace = async () => {
      const where = q
        ? {
            OR: [
              { username: buildContains(q) },
              { email: buildContains(q) },
              { phone: buildContains(q) },
              { name: buildContains(q) },
            ],
          }
        : undefined;

      const users = await prisma.marketplaceUser.findMany({
        where,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          username: true,
          name: true,
          email: true,
          phone: true,
          image: true,
          createdAt: true,
        },
      });

      for (const u of users) {
        const name = (u.name?.trim() || u.username || u.phone || `User #${u.id}`).trim();
        rows.push({
          source: 'marketplace',
          dbId: u.id,
          name,
          subtitle: u.username ? `@${u.username}` : null,
          email: u.email ?? null,
          phone: u.phone,
          roleLabel: 'Marketplace',
          status: null,
          avatar: u.image ?? null,
          createdAt: u.createdAt.toISOString(),
        });
      }
    };

    const loadDrivers = async () => {
      const where = q
        ? {
            OR: [
              { name: buildContains(q) },
              { username: buildContains(q) },
              { phone: buildContains(q) },
              { user: { email: buildContains(q) } },
            ],
          }
        : undefined;

      const drivers = await prisma.driver.findMany({
        where,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          username: true,
          phone: true,
          status: true,
          avatar: true,
          createdAt: true,
          user: { select: { email: true } },
        },
      });

      for (const d of drivers) {
        rows.push({
          source: 'driver',
          dbId: d.id,
          name: (d.name?.trim() || d.username || `Driver #${d.id}`).trim(),
          subtitle: d.username ? `@${d.username}` : null,
          email: d.user?.email ?? null,
          phone: d.phone ?? null,
          roleLabel: 'Driver',
          status: d.status ?? null,
          avatar: d.avatar ?? null,
          createdAt: d.createdAt.toISOString(),
        });
      }
    };

    if (source === 'dashboard') await loadDashboard();
    else if (source === 'marketplace') await loadMarketplace();
    else if (source === 'driver') await loadDrivers();
    else {
      await Promise.all([loadDashboard(), loadMarketplace(), loadDrivers()]);
      rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
      // Enforce global limit after merging sources.
      rows.splice(take);
    }

    return NextResponse.json({ users: rows }, { status: 200, headers });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED_PLATFORM_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }
    return NextResponse.json({ error: 'Failed to load users' }, { status: 500, headers });
  }
}

import { describe, beforeEach, expect, it, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { hash } from 'bcryptjs';
import { prisma } from '@/lib/db';
import { fetchMarketplaceProducts } from '@/app/api/graphql/modules/marketplace/handlers/products';
import { GET as getEngineStatus } from '@/app/api/platform-admin/search/engine-status/route';
import { signPlatformAdminToken } from '@/lib/platform-admin-jwt';
import { PLATFORM_ADMIN_COOKIE } from '@/utils/platform-admin-auth';
import { resetDb } from './helpers';
import { createPublishedProductWithColorVariants, createTestDistributor } from './helpers/productFixtures';

async function makePlatformAdminRequest(url: string) {
  const passwordHash = await hash('test-admin-pass', 10);
  const admin = await prisma.platformAdmin.create({
    data: {
      email: `admin_${Date.now()}@integration.test`,
      passwordHash,
      name: 'Test Admin',
    },
    select: { id: true },
  });
  const token = signPlatformAdminToken({ sub: admin.id });
  const req = new Request(url, {
    method: 'GET',
    headers: {
      cookie: `${PLATFORM_ADMIN_COOKIE}=${token}`,
      'x-forwarded-for': '127.0.0.1',
    },
  });
  return new NextRequest(req);
}

describe('marketplace search engine mode (integration)', () => {
  const envBackup = {
    MARKETPLACE_SEARCH_ENGINE: process.env.MARKETPLACE_SEARCH_ENGINE,
    MEILI_HOST: process.env.MEILI_HOST,
  };

  beforeEach(async () => {
    await resetDb();
    delete process.env.MARKETPLACE_SEARCH_ENGINE;
    delete process.env.MEILI_HOST;
    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = 'vitest-integration-jwt-secret';
    }
  });

  afterEach(() => {
    if (envBackup.MARKETPLACE_SEARCH_ENGINE === undefined) {
      delete process.env.MARKETPLACE_SEARCH_ENGINE;
    } else {
      process.env.MARKETPLACE_SEARCH_ENGINE = envBackup.MARKETPLACE_SEARCH_ENGINE;
    }
    if (envBackup.MEILI_HOST === undefined) {
      delete process.env.MEILI_HOST;
    } else {
      process.env.MEILI_HOST = envBackup.MEILI_HOST;
    }
  });

  it('exposes engine metadata on search responses (auto mode)', async () => {
    const distributor = await createTestDistributor();
    await createPublishedProductWithColorVariants(distributor.id, 'P-SEARCH-1');

    const res = await fetchMarketplaceProducts({
      search: 'Sync Test Shirt',
      limit: 10,
    });

    expect(res.engineRequested).toBe('auto');
    expect(res.degraded).toBe(false);
    expect(['meili', 'pg_trgm', 'js_score', 'prisma']).toContain(res.engine);
    expect(res.nodes.length).toBeGreaterThan(0);
  });

  it('flags degraded when strict meili mode cannot use Meili', async () => {
    process.env.MARKETPLACE_SEARCH_ENGINE = 'meili';
    delete process.env.MEILI_HOST;

    const distributor = await createTestDistributor();
    await createPublishedProductWithColorVariants(distributor.id, 'P-SEARCH-2');

    const res = await fetchMarketplaceProducts({
      search: 'Sync Test Shirt',
      limit: 10,
    });

    expect(res.engineRequested).toBe('meili');
    expect(res.engine).not.toBe('meili');
    expect(res.degraded).toBe(true);
  });

  it('logs the engine used to MarketplaceSearchQueryLog', async () => {
    const distributor = await createTestDistributor();
    await createPublishedProductWithColorVariants(distributor.id, 'P-SEARCH-3');

    const res = await fetchMarketplaceProducts({
      search: 'Sync Test Shirt',
      limit: 10,
    });

    await new Promise((r) => setTimeout(r, 50));

    const log = await prisma.marketplaceSearchQueryLog.findFirst({
      where: { query: 'Sync Test Shirt' },
      orderBy: { createdAt: 'desc' },
    });
    expect(log).not.toBeNull();
    expect(log!.engine).toBe(res.engine);
    expect(log!.resultCount).toBe(res.nodes.length);
  });

  it('engine-status endpoint reports mode and engine breakdown', async () => {
    const distributor = await createTestDistributor();
    await createPublishedProductWithColorVariants(distributor.id, 'P-SEARCH-4');

    await fetchMarketplaceProducts({ search: 'Sync Test Shirt', limit: 10 });
    await new Promise((r) => setTimeout(r, 50));

    const response = await getEngineStatus(
      await makePlatformAdminRequest('http://localhost/api/platform-admin/search/engine-status?days=1'),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      mode: string;
      meili: { configured: boolean };
      totalSearches: number;
      engineBreakdown: Array<{ engine: string; count: number }>;
    };
    expect(body.mode).toBe('auto');
    expect(body.meili.configured).toBe(false);
    expect(body.totalSearches).toBeGreaterThan(0);
    expect(body.engineBreakdown.length).toBeGreaterThan(0);
  });
});

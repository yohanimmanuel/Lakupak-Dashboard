import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const redisMocks = vi.hoisted(() => ({
  getRedisClient: vi.fn(() => null as unknown),
  isRedisAvailable: vi.fn(() => false),
}));

vi.mock('@/lib/redis', () => ({
  getRedisClient: redisMocks.getRedisClient,
  isRedisAvailable: redisMocks.isRedisAvailable,
}));

import {
  calculateGraphQLComplexity,
  clearAllRateLimits,
  clientCreationRateLimiter,
  clientQueryRateLimiter,
  getClientIp,
  getRateLimitStatus,
  GraphQLComplexityParseError,
  loginRateLimiter,
  RATE_LIMIT_QUANTITIES,
  rateLimit,
} from '@/utils/rateLimiter';

function makeRequest(ip = '203.0.113.10'): NextRequest {
  return new NextRequest('http://localhost/api/test', {
    method: 'GET',
    headers: {
      'x-forwarded-for': ip,
    },
  });
}

describe('rateLimiter', () => {
  beforeEach(() => {
    // rateLimit() short-circuits when NODE_ENV === 'test'; enable real limiting.
    vi.stubEnv('NODE_ENV', 'development');
    clearAllRateLimits();
    redisMocks.getRedisClient.mockReturnValue(null);
    redisMocks.isRedisAvailable.mockReturnValue(false);
  });

  afterEach(() => {
    clearAllRateLimits();
    vi.unstubAllEnvs();
  });

  describe('getClientIp', () => {
    it('reads the first x-forwarded-for hop', () => {
      const req = new NextRequest('http://localhost/api/test', {
        headers: { 'x-forwarded-for': '198.51.100.1, 10.0.0.1' },
      });
      expect(getClientIp(req)).toBe('198.51.100.1');
    });

    it('falls back to x-real-ip', () => {
      const req = new NextRequest('http://localhost/api/test', {
        headers: { 'x-real-ip': '198.51.100.2' },
      });
      expect(getClientIp(req)).toBe('198.51.100.2');
    });
  });

  describe('rateLimit core', () => {
    it('allows requests under the limit and blocks after maxRequests', async () => {
      const req = makeRequest();
      const config = {
        windowMs: 60_000,
        maxRequests: 3,
        message: 'Too many test requests.',
        keyGenerator: () => 'unit-test:core',
      };

      expect(await rateLimit(req, config)).toBeNull();
      expect(await rateLimit(req, config)).toBeNull();
      expect(await rateLimit(req, config)).toBeNull();

      const blocked = await rateLimit(req, config);
      expect(blocked).not.toBeNull();
      expect(blocked!.status).toBe(429);
      const body = await blocked!.json();
      expect(body.error).toBe('Too many test requests.');
    });

    it('keeps separate counters for different keys', async () => {
      const req = makeRequest();
      const a = {
        windowMs: 60_000,
        maxRequests: 1,
        keyGenerator: () => 'unit-test:bucket-a',
      };
      const b = {
        windowMs: 60_000,
        maxRequests: 1,
        keyGenerator: () => 'unit-test:bucket-b',
      };

      expect(await rateLimit(req, a)).toBeNull();
      expect(await rateLimit(req, a)).not.toBeNull();
      expect(await rateLimit(req, b)).toBeNull();
    });
  });

  describe('redis burst path', () => {
    it('returns 429 when mocked Redis reports burstCount above burstLimit', async () => {
      const now = Date.now();
      const mockRedis = {
        get: vi.fn(async () => null),
        // Return strings to mirror redis.eval encoding and exercise Number() coercion
        eval: vi.fn(async () => ['4', String(now - 500)] as [string, string]),
        ttl: vi.fn(async () => 1),
      };
      redisMocks.getRedisClient.mockReturnValue(mockRedis);
      redisMocks.isRedisAvailable.mockReturnValue(true);

      const blocked = await rateLimit(makeRequest('203.0.113.200'), {
        windowMs: 60_000,
        maxRequests: 100,
        burstLimit: 3,
        burstWindowMs: 1000,
        message: 'Burst exceeded.',
        keyGenerator: () => 'unit-test:burst',
      });

      expect(mockRedis.eval).toHaveBeenCalled();
      expect(blocked).not.toBeNull();
      expect(blocked!.status).toBe(429);
      const body = await blocked!.json();
      expect(body.error).toBe('Burst exceeded.');
      expect(blocked!.headers.get('X-RateLimit-Burst-Limit')).toBe('3');
    });

    it('fails closed with 429 when mocked Redis returns non-finite burst values', async () => {
      const mockRedis = {
        get: vi.fn(async () => null),
        eval: vi.fn(async () => ['not-a-number', 'also-bad'] as [string, string]),
        ttl: vi.fn(async () => 1),
      };
      redisMocks.getRedisClient.mockReturnValue(mockRedis);
      redisMocks.isRedisAvailable.mockReturnValue(true);

      const blocked = await rateLimit(makeRequest('203.0.113.201'), {
        windowMs: 60_000,
        maxRequests: 100,
        burstLimit: 3,
        burstWindowMs: 1000,
        message: 'Burst exceeded.',
        keyGenerator: () => 'unit-test:burst-nan',
      });

      expect(blocked).not.toBeNull();
      expect(blocked!.status).toBe(429);
      const retryAfter = Number(blocked!.headers.get('Retry-After'));
      expect(Number.isFinite(retryAfter)).toBe(true);
      expect(retryAfter).toBeGreaterThanOrEqual(1);
    });
  });

  describe('per-user client limiters', () => {
    it('does not share client-query limits across different userIds on the same IP', async () => {
      const req = makeRequest('203.0.113.50');

      const limit = RATE_LIMIT_QUANTITIES.clientQuery.maxRequests;
      for (let i = 0; i < limit; i += 1) {
        expect(await clientQueryRateLimiter(req, 101)).toBeNull();
      }
      expect(await clientQueryRateLimiter(req, 101)).not.toBeNull();
      expect(await clientQueryRateLimiter(req, 202)).toBeNull();
    });

    it('does not share client-create limits across different userIds on the same IP', async () => {
      const req = makeRequest('203.0.113.51');
      const limit = RATE_LIMIT_QUANTITIES.clientCreate.maxRequests;

      for (let i = 0; i < limit; i += 1) {
        expect(await clientCreationRateLimiter(req, 11)).toBeNull();
      }
      expect(await clientCreationRateLimiter(req, 11)).not.toBeNull();
      expect(await clientCreationRateLimiter(req, 22)).toBeNull();
    });

    it('uses separate buckets for the same userId on different IPs', async () => {
      const reqA = makeRequest('203.0.113.60');
      const reqB = makeRequest('203.0.113.61');
      const limit = RATE_LIMIT_QUANTITIES.clientCreate.maxRequests;

      for (let i = 0; i < limit; i += 1) {
        expect(await clientCreationRateLimiter(reqA, 77)).toBeNull();
      }
      expect(await clientCreationRateLimiter(reqA, 77)).not.toBeNull();
      expect(await clientCreationRateLimiter(reqB, 77)).toBeNull();
    });

    it('falls back to a shared IP bucket when userId is null', async () => {
      const req = makeRequest('203.0.113.70');
      const limit = RATE_LIMIT_QUANTITIES.clientCreate.maxRequests;

      for (let i = 0; i < limit; i += 1) {
        expect(await clientCreationRateLimiter(req, null)).toBeNull();
      }
      expect(await clientCreationRateLimiter(req, null)).not.toBeNull();
    });

    it('records per-user keys in the in-memory store', async () => {
      const req = makeRequest('203.0.113.80');
      await clientQueryRateLimiter(req, 55);

      const status = await getRateLimitStatus('client-query:55:203.0.113.80');
      expect(status).not.toBeNull();
      expect(status!.count).toBe(1);
    });
  });

  describe('calculateGraphQLComplexity', () => {
    it('derives depth and fieldCount from the AST', () => {
      const result = calculateGraphQLComplexity(`
        query {
          user {
            posts {
              title
            }
          }
        }
      `);
      expect(result.fieldCount).toBe(3);
      expect(result.depth).toBe(3);
      expect(result.complexity).toBe(3 * 3 * 10);
    });

    it('ignores comments and string literals when counting fields', () => {
      const result = calculateGraphQLComplexity(`
        query {
          # field bait { bait }
          user(name: "posts { title }") {
            id
          }
        }
      `);
      expect(result.fieldCount).toBe(2);
      expect(result.depth).toBe(2);
    });

    it('rejects documents that fail to parse', () => {
      expect(() => calculateGraphQLComplexity('query {')).toThrow(GraphQLComplexityParseError);
    });

    it('counts fragment fields at each spread site, not from the fragment definition alone', () => {
      const result = calculateGraphQLComplexity(`
        query {
          user {
            ...UserFields
          }
        }
        fragment UserFields on User {
          id
          profile {
            name
          }
        }
      `);
      // user + id + profile + name
      expect(result.fieldCount).toBe(4);
      expect(result.depth).toBe(3);
    });

    it('counts repeated fragment spreads each time they appear', () => {
      const result = calculateGraphQLComplexity(`
        query {
          a { ...Item }
          b { ...Item }
        }
        fragment Item on Node {
          id
        }
      `);
      // a, id, b, id
      expect(result.fieldCount).toBe(4);
      expect(result.depth).toBe(2);
    });

    it('does not infinite-loop on cyclic fragment references', () => {
      const result = calculateGraphQLComplexity(`
        query {
          user {
            ...FragA
          }
        }
        fragment FragA on User {
          id
          ...FragB
        }
        fragment FragB on User {
          name
          ...FragA
        }
      `);
      // user, id, name (cycle back to FragA skipped)
      expect(result.fieldCount).toBe(3);
      expect(result.depth).toBe(2);
    });

    it('throws when fragment-spread fan-out exceeds the walk ceiling', () => {
      // Empty nested spreads still count toward selectionVisits and must not traverse unboundedly.
      const spreads = Array.from(
        { length: RATE_LIMIT_QUANTITIES.graphqlComplexity.maxFields + 2 },
        () => '...Empty',
      ).join('\n');
      expect(() =>
        calculateGraphQLComplexity(`
          query {
            ${spreads}
          }
          fragment Empty on Node {
            ...Empty
          }
        `),
      ).toThrow(GraphQLComplexityParseError);
    });

    it('throws when inline-fragment recursion exceeds maxDepth', () => {
      const maxDepth = RATE_LIMIT_QUANTITIES.graphqlComplexity.maxDepth;
      let nested = 'id';
      for (let i = 0; i < maxDepth + 2; i += 1) {
        nested = `... on Node { ${nested} }`;
      }
      expect(() =>
        calculateGraphQLComplexity(`
          query {
            ${nested}
          }
        `),
      ).toThrow(GraphQLComplexityParseError);
    });
  });

  describe('auth IP-scoped limiters', () => {
    it('shares login limits by IP, not by a global bucket', async () => {
      const ipA = makeRequest('203.0.113.90');
      const ipB = makeRequest('203.0.113.91');

      const limit = RATE_LIMIT_QUANTITIES.login.maxRequests;
      for (let i = 0; i < limit; i += 1) {
        expect(await loginRateLimiter(ipA)).toBeNull();
      }
      expect(await loginRateLimiter(ipA)).not.toBeNull();
      expect(await loginRateLimiter(ipB)).toBeNull();
    });
  });
});

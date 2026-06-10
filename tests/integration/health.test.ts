import { describe, expect, it } from 'vitest';
import { GET } from '@/app/api/health/route';

describe('GET /api/health', () => {
  it('returns ok when the database is reachable', async () => {
    const response = await GET();
    const body = (await response.json()) as { ok: boolean; db: string };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.db).toBe('up');
  });
});

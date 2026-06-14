import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateDashboardEnv } from '@/lib/validateEnv';

type WarnSpy = {
  mock: { calls: unknown[][] };
  mockRestore: () => void;
};

describe('validateDashboardEnv', () => {
  let warnSpy: WarnSpy;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/postgres');
    vi.stubEnv('AUTH_SECRET', 'vitest-auth-secret-min-16-chars');
    vi.stubEnv('JWT_SECRET', 'vitest-jwt-secret-min-16-chars');
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  function cloudinaryWarnings(): string[] {
    return warnSpy.mock.calls
      .map((call) => String(call[0]))
      .filter((message) => message.includes('Cloudinary'));
  }

  it('does not warn about Cloudinary when NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME is set', () => {
    vi.stubEnv('NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME', 'test-cloud');
    validateDashboardEnv({ strict: false });
    expect(cloudinaryWarnings()).toHaveLength(0);
  });

  it('does not warn about Cloudinary when CLOUDINARY_CLOUD_NAME is set', () => {
    vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'test-cloud');
    validateDashboardEnv({ strict: false });
    expect(cloudinaryWarnings()).toHaveLength(0);
  });

  it('warns about Cloudinary when neither alias is set', () => {
    validateDashboardEnv({ strict: false });
    expect(cloudinaryWarnings().length).toBeGreaterThan(0);
  });
});

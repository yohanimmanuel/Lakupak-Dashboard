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
    delete process.env.RESEND_API_KEY;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  function emailWarnings(): string[] {
    return warnSpy.mock.calls
      .map((call) => String(call[0]))
      .filter((message) => message.includes('Email is not configured'));
  }

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

  it('does not warn about email when RESEND_API_KEY is set', () => {
    vi.stubEnv('RESEND_API_KEY', 're_test');
    validateDashboardEnv({ strict: false });
    expect(emailWarnings()).toHaveLength(0);
  });

  it('does not warn about email when complete SMTP is set', () => {
    vi.stubEnv('SMTP_HOST', 'smtp.gmail.com');
    vi.stubEnv('SMTP_USER', 'dev@example.com');
    vi.stubEnv('SMTP_PASS', 'app-password');
    validateDashboardEnv({ strict: false });
    expect(emailWarnings()).toHaveLength(0);
  });

  it('warns about email when only SMTP_HOST is set', () => {
    vi.stubEnv('SMTP_HOST', 'smtp.gmail.com');
    validateDashboardEnv({ strict: false });
    expect(emailWarnings().length).toBeGreaterThan(0);
  });

  it('requires RESEND_API_KEY in production even if SMTP_HOST is set', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
    vi.stubEnv('DIRECT_URL', 'postgresql://postgres:postgres@localhost:5432/postgres');
    vi.stubEnv('SMTP_HOST', 'smtp.gmail.com');
    vi.stubEnv('SMTP_USER', 'dev@example.com');
    vi.stubEnv('SMTP_PASS', 'app-password');
    expect(() => validateDashboardEnv({ strict: true })).toThrow(/RESEND_API_KEY/);
  });

  it('does not require RESEND_API_KEY for CI strict checks', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
    vi.stubEnv('DIRECT_URL', 'postgresql://postgres:postgres@localhost:5432/postgres');
    expect(() => validateDashboardEnv({ strict: true })).not.toThrow();
  });
});

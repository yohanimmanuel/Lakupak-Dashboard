import { z } from 'zod';

function isNonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function formatIssues(issues: z.ZodIssue[]): string {
  return issues.map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`).join('\n');
}

const coreSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  AUTH_SECRET: z.string().min(16, 'AUTH_SECRET must be at least 16 characters'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
});

const productionSchema = coreSchema.extend({
  REDIS_URL: z.string().min(1, 'REDIS_URL is required in production'),
  DIRECT_URL: z.string().min(1, 'DIRECT_URL is required in production for migrations'),
});

const OPTIONAL_FEATURE_VARS = [
  'MEILI_HOST',
  'TWILIO_ACCOUNT_SID',
  'AUDIT_SERVICE_URL',
] as const;

/** Warn only when none of the listed aliases are set. */
const OPTIONAL_FEATURE_ALIASES: { label: string; keys: readonly string[] }[] = [
  {
    label: 'Cloudinary (CLOUDINARY_CLOUD_NAME or NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME)',
    keys: ['CLOUDINARY_CLOUD_NAME', 'NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME'],
  },
  {
    label: 'Google Maps geocoding (GOOGLE_MAPS_API_KEY or GOOGLE_GEOCODING_API_KEY)',
    keys: ['GOOGLE_MAPS_API_KEY', 'GOOGLE_GEOCODING_API_KEY'],
  },
];

export type ValidateDashboardEnvOptions = {
  /** When true, missing required vars throw. Defaults to NODE_ENV === 'production'. */
  strict?: boolean;
};

/**
 * Validates Dashboard environment variables.
 * Production runtime (NODE_ENV=production): core + REDIS_URL + DIRECT_URL + RESEND_API_KEY.
 * CI strict checks: core + REDIS_URL + DIRECT_URL (no live email key).
 * Development: warns on missing core vars; never blocks startup for optional integrations.
 */
export function validateDashboardEnv(options: ValidateDashboardEnvOptions = {}): void {
  const strict = options.strict ?? process.env.NODE_ENV === 'production';
  const isProductionRuntime = process.env.NODE_ENV === 'production';
  const schema = strict ? productionSchema : coreSchema;
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    const message = `Invalid environment configuration:\n${formatIssues(parsed.error.issues)}\nSee env.example for required variables.`;
    if (strict) {
      throw new Error(message);
    }
    console.warn(`[env] ${message}`);
  }

  const hasResend = isNonEmpty(process.env.RESEND_API_KEY);
  const hasCompleteSmtp =
    isNonEmpty(process.env.SMTP_HOST) &&
    isNonEmpty(process.env.SMTP_USER) &&
    isNonEmpty(process.env.SMTP_PASS);

  if (isProductionRuntime && !hasResend) {
    throw new Error(
      'RESEND_API_KEY is required in production. Gmail SMTP is skipped on Render; transactional mail uses Resend HTTPS.',
    );
  }

  if (!strict) {
    for (const key of ['DATABASE_URL', 'AUTH_SECRET', 'JWT_SECRET'] as const) {
      if (!isNonEmpty(process.env[key])) {
        console.warn(`[env] ${key} is not set — copy env.example to .env before running the Dashboard.`);
      }
    }

    if (!hasResend && !hasCompleteSmtp) {
      console.warn(
        '[env] Email is not configured — set RESEND_API_KEY, or SMTP_HOST + SMTP_USER + SMTP_PASS for local Gmail fallback. SMTP_HOST alone is not enough.',
      );
    }
  }

  for (const key of OPTIONAL_FEATURE_VARS) {
    if (!isNonEmpty(process.env[key])) {
      console.warn(`[env] Optional ${key} is not set — related features may be degraded.`);
    }
  }

  for (const group of OPTIONAL_FEATURE_ALIASES) {
    if (!group.keys.some((key) => isNonEmpty(process.env[key]))) {
      console.warn(`[env] Optional ${group.label} is not set — related features may be degraded.`);
    }
  }
}

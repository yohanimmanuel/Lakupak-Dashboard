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
  'CLOUDINARY_CLOUD_NAME',
  'TWILIO_ACCOUNT_SID',
  'SMTP_HOST',
  'AUDIT_SERVICE_URL',
] as const;

export type ValidateDashboardEnvOptions = {
  /** When true, missing required vars throw. Defaults to NODE_ENV === 'production'. */
  strict?: boolean;
};

/**
 * Validates Dashboard environment variables.
 * Production: strict on core + REDIS_URL + DIRECT_URL.
 * Development: warns on missing core vars; never blocks startup for optional integrations.
 */
export function validateDashboardEnv(options: ValidateDashboardEnvOptions = {}): void {
  const strict = options.strict ?? process.env.NODE_ENV === 'production';
  const schema = strict ? productionSchema : coreSchema;
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    const message = `Invalid environment configuration:\n${formatIssues(parsed.error.issues)}\nSee env.example for required variables.`;
    if (strict) {
      throw new Error(message);
    }
    console.warn(`[env] ${message}`);
  }

  if (!strict) {
    for (const key of ['DATABASE_URL', 'AUTH_SECRET', 'JWT_SECRET'] as const) {
      if (!isNonEmpty(process.env[key])) {
        console.warn(`[env] ${key} is not set — copy env.example to .env before running the Dashboard.`);
      }
    }
  }

  for (const key of OPTIONAL_FEATURE_VARS) {
    if (!isNonEmpty(process.env[key])) {
      console.warn(`[env] Optional ${key} is not set — related features may be degraded.`);
    }
  }
}

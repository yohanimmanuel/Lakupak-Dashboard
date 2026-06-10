import { config } from 'dotenv';
import { resolve } from 'path';
import { validateDashboardEnv } from '../lib/validateEnv';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

const strict =
  process.argv.includes('--strict') ||
  process.env.CI === 'true' ||
  process.env.VALIDATE_ENV_STRICT === '1';

validateDashboardEnv({ strict });
// eslint-disable-next-line no-console
console.log(`[validate:env] OK${strict ? ' (strict)' : ''}`);

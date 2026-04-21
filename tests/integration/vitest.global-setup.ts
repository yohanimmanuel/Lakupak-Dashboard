import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb } from './test-db';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function globalSetup() {
  const { dbName, baseUrl, databaseUrl } = await createTestDb();

  // Make schema information available to teardown and tests (via env).
  process.env.VITEST_DB_NAME = dbName;
  process.env.VITEST_DB_BASE_URL = baseUrl;

  // Ensure app code and Prisma CLI both point at the isolated schema.
  process.env.DATABASE_URL = databaseUrl;
  process.env.DIRECT_URL = databaseUrl;

  execSync('npx prisma migrate deploy', {
    cwd: path.resolve(__dirname, '../..'),
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DIRECT_URL: databaseUrl,
    },
  });
}


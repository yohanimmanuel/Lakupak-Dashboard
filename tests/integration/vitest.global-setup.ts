import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, dropTestDb } from './test-db';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function globalSetup() {
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'vitest-integration-jwt-secret-min-16-chars';
  }
  if (!process.env.AUTH_SECRET) {
    process.env.AUTH_SECRET = 'vitest-integration-auth-secret-min-16-chars';
  }

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

  const { Client } = await import('pg');
  const extClient = new Client({ connectionString: databaseUrl });
  await extClient.connect();
  try {
    await extClient.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
  } catch (err) {
    console.warn('[vitest] pg_trgm extension not available:', err);
  } finally {
    await extClient.end();
  }

  // Vitest teardown hook: run after all tests in this run.
  return async () => {
    try {
      await dropTestDb(baseUrl, dbName);
    } catch (err) {
      console.error('[vitest] Failed to drop test database:', err);
    }
  };
}


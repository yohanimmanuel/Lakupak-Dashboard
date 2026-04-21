import { dropTestDb } from './test-db';

export default async function globalTeardown() {
  const dbName = process.env.VITEST_DB_NAME;
  const baseUrl = process.env.VITEST_DB_BASE_URL;
  if (!dbName || !baseUrl) return;

  try {
    await dropTestDb(baseUrl, dbName);
  } catch (err) {
    // Don't fail the test run due to cleanup errors.
    console.error('[vitest] Failed to drop test database:', err);
  }
}


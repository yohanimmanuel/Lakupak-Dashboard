import { Client } from 'pg';
import { randomUUID } from 'node:crypto';

function withDatabaseName(urlString: string, dbName: string): string {
  const url = new URL(urlString);
  url.pathname = `/${dbName}`;
  return url.toString();
}

export type TestDbInfo = {
  dbName: string;
  baseUrl: string;
  databaseUrl: string;
};

export async function createTestDb(): Promise<TestDbInfo> {
  const allowFallback = process.env.VITEST_ALLOW_EXISTING_DB_URL === '1';
  const baseUrlRaw = process.env.TEST_DATABASE_URL || (allowFallback ? (process.env.DIRECT_URL || process.env.DATABASE_URL) : undefined);
  if (!baseUrlRaw) {
    throw new Error(
      [
        'Missing database env for integration tests.',
        '',
        'Set one of:',
        '- TEST_DATABASE_URL (required by default; direct Postgres connection)',
        '',
        'Optional (only if you understand the risks):',
        '- set VITEST_ALLOW_EXISTING_DB_URL=1 to allow DIRECT_URL/DATABASE_URL fallback',
        '',
        'Tip: you can start a local Postgres via Docker:',
        '  docker compose --profile local-db up -d',
        'and then set:',
        '  TEST_DATABASE_URL="postgresql://laku:laku_secret@localhost:5432/laku"',
      ].join('\n'),
    );
  }

  // We create a fresh DATABASE per run because the baseline migration targets "public".*
  // Schema-level isolation doesn't work when migrations explicitly reference "public".
  // Preserve search params (e.g., sslmode) but connect to default 'postgres' database for admin operations
  const baseUrl = withDatabaseName(baseUrlRaw, 'postgres');
  const dbName = `vitest_${randomUUID().replace(/-/g, '')}`;
  const databaseUrl = withDatabaseName(baseUrlRaw, dbName);

  // Helpful debug (never prints password).
  try {
    const u = new URL(databaseUrl);
    const db = u.pathname?.startsWith('/') ? u.pathname.slice(1) : u.pathname;
    // eslint-disable-next-line no-console
    console.log(`[vitest][db] using ${u.protocol}//${u.username}@${u.hostname}:${u.port || '5432'}/${db || ''}`);
  } catch {
    // ignore
  }

  const client = new Client({ connectionString: baseUrl });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await client.end();
  }

  return {
    dbName,
    baseUrl,
    databaseUrl,
  };
}

export async function dropTestDb(baseUrl: string, dbName: string): Promise<void> {
  // Preserve query params (e.g., SSL settings) for admin connection too.
  const client = new Client({ connectionString: baseUrl });
  await client.connect();
  try {
    // PostgreSQL 13+ supports DROP DATABASE ... WITH (FORCE); avoids failures due to leftover connections.
    // Integration tests require PostgreSQL 13+.
    await client.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  } finally {
    await client.end();
  }
}

